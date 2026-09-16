// Sessões de terminal SSH. Uma conexão TCP dedicada por terminal; leitura em
// thread própria com sessão non-blocking, dados emitidos como base64 no evento
// `ssh:data:{serverId}`.
use crate::vault::{self, Server};
use base64::Engine;
use sha2::Digest;
use ssh2::Session;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

pub struct TermSession {
    inner: Arc<Mutex<(Session, ssh2::Channel)>>,
    alive: Arc<AtomicBool>,
}

pub type TermState = Mutex<HashMap<String, TermSession>>;

/// TOFU: guarda o hash da host key no primeiro connect e recusa se mudar.
fn check_host_key(app: &tauri::AppHandle, sess: &Session, host: &str, port: u16) -> Result<(), String> {
    let (key, _) = sess.host_key().ok_or("Servidor não enviou host key")?;
    let fp = base64::engine::general_purpose::STANDARD.encode(sha2::Sha256::digest(key));
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join("known_hosts.json");
    let mut known: HashMap<String, String> = std::fs::read(&path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let id = format!("{host}:{port}");
    match known.get(&id) {
        Some(saved) if *saved != fp => Err(format!(
            "HOST KEY MUDOU para {id}! Possível MITM. Se o servidor foi reinstalado de propósito, apague a entrada em known_hosts.json. Fingerprint atual: SHA256:{fp}"
        )),
        Some(_) => Ok(()),
        None => {
            known.insert(id, fp);
            std::fs::create_dir_all(&dir).ok();
            std::fs::write(&path, serde_json::to_vec_pretty(&known).unwrap()).ok();
            Ok(())
        }
    }
}

/// Abre TCP + handshake + auth. Usada pelo terminal, SFTP e forwards.
/// `progress`: id da sessão pra emitir eventos `ssh:stage:{id}` a cada etapa.
pub fn open_session(
    app: &tauri::AppHandle,
    srv: &Server,
    progress: Option<&str>,
) -> Result<Session, String> {
    let stage = |s: &str| {
        if let Some(id) = progress {
            let _ = app.emit(&format!("ssh:stage:{id}"), s.to_string());
        }
    };
    stage("resolvendo-dns");
    let addr = (srv.host.as_str(), srv.port)
        .to_socket_addrs()
        .map_err(|e| format!("DNS falhou: {e}"))?
        .next()
        .ok_or("Host não resolveu")?;
    stage("conectando-tcp");
    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
        .map_err(|e| format!("Conexão falhou: {e}"))?;
    tcp.set_nodelay(true).ok();
    let mut sess = Session::new().map_err(|e| e.to_string())?;
    sess.set_tcp_stream(tcp);
    sess.set_timeout(15_000);
    stage("handshake");
    sess.handshake().map_err(|e| format!("Handshake falhou: {e}"))?;
    stage("verificando-host-key");
    check_host_key(app, &sess, &srv.host, srv.port)?;
    stage("autenticando");
    match srv.auth_type.as_str() {
        "key" => {
            let path = srv.key_path.as_deref().ok_or("Caminho da chave não definido")?;
            sess.userauth_pubkey_file(
                &srv.username,
                None,
                std::path::Path::new(path),
                srv.key_passphrase.as_deref().filter(|p| !p.is_empty()),
            )
            .map_err(|e| format!("Autenticação por chave falhou: {e}"))?;
        }
        _ => {
            let pw = srv.password.as_deref().ok_or("Senha não definida")?;
            sess.userauth_password(&srv.username, pw)
                .map_err(|e| format!("Autenticação falhou: {e}"))?;
        }
    }
    if !sess.authenticated() {
        return Err("Autenticação recusada".into());
    }
    sess.set_keepalive(true, 30);
    Ok(sess)
}

#[tauri::command]
pub async fn ssh_connect(
    app: tauri::AppHandle,
    server_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    {
        let terms = app.state::<TermState>();
        if terms.lock().unwrap().contains_key(&server_id) {
            return Err("Já existe uma conexão com esse servidor".into());
        }
    }
    let srv = vault::get_server(&app, &server_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let sess = open_session(&app, &srv, Some(&server_id))?;
        let _ = app.emit(&format!("ssh:stage:{server_id}"), "abrindo-shell".to_string());
        let mut channel = sess.channel_session().map_err(|e| e.to_string())?;
        channel
            .request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))
            .map_err(|e| e.to_string())?;
        channel.shell().map_err(|e| e.to_string())?;
        sess.set_blocking(false);

        let inner = Arc::new(Mutex::new((sess, channel)));
        let alive = Arc::new(AtomicBool::new(true));
        app.state::<TermState>().lock().unwrap().insert(
            server_id.clone(),
            TermSession { inner: inner.clone(), alive: alive.clone() },
        );

        let reader_app = app.clone();
        std::thread::spawn(move || {
            let b64 = &base64::engine::general_purpose::STANDARD;
            let mut buf = [0u8; 16384];
            let mut out = Vec::with_capacity(65536);
            'outer: while alive.load(Ordering::Relaxed) {
                out.clear();
                {
                    let mut g = inner.lock().unwrap();
                    let _ = g.0.keepalive_send();
                    // drena tudo que houver antes de soltar o lock
                    loop {
                        match g.1.read(&mut buf) {
                            Ok(0) => break 'outer, // canal fechou
                            Ok(n) => {
                                out.extend_from_slice(&buf[..n]);
                                if out.len() > 512 * 1024 {
                                    break;
                                }
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                            Err(_) => break 'outer,
                        }
                    }
                    if g.1.eof() {
                        break;
                    }
                }
                if out.is_empty() {
                    std::thread::sleep(Duration::from_millis(8));
                } else {
                    let _ = reader_app.emit(&format!("ssh:data:{server_id}"), b64.encode(&out));
                }
            }
            reader_app
                .state::<TermState>()
                .lock()
                .unwrap()
                .remove(&server_id);
            let _ = reader_app.emit(&format!("ssh:closed:{server_id}"), ());
        });
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn with_term<T>(
    app: &tauri::AppHandle,
    server_id: &str,
    f: impl FnOnce(&mut (Session, ssh2::Channel)) -> T,
) -> Result<T, String> {
    let terms = app.state::<TermState>();
    let guard = terms.lock().unwrap();
    let t = guard.get(server_id).ok_or("Sessão não encontrada")?;
    let inner = t.inner.clone();
    drop(guard);
    let mut g = inner.lock().unwrap();
    Ok(f(&mut g))
}

#[tauri::command]
pub fn ssh_write(app: tauri::AppHandle, server_id: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| e.to_string())?;
    with_term(&app, &server_id, |g| write_all_nb(&mut g.1, &bytes))?
}

/// write_all pra canal non-blocking: espera o WouldBlock em vez de falhar.
fn write_all_nb(ch: &mut ssh2::Channel, bytes: &[u8]) -> Result<(), String> {
    let mut off = 0;
    while off < bytes.len() {
        match ch.write(&bytes[off..]) {
            Ok(n) => off += n,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(2))
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn ssh_resize(app: tauri::AppHandle, server_id: String, cols: u32, rows: u32) -> Result<(), String> {
    with_term(&app, &server_id, |g| {
        g.1.request_pty_size(cols, rows, None, None).ok();
    })
}

#[tauri::command]
pub async fn ssh_disconnect(app: tauri::AppHandle, server_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let terms = app.state::<TermState>();
        let sess = terms.lock().unwrap().remove(&server_id);
        if let Some(t) = sess {
            t.alive.store(false, Ordering::Relaxed);
            if let Ok(mut g) = t.inner.lock() {
                // encerra o shell de forma limpa (exit + EOF) e dá até 1s pro servidor
                // fechar o canal, pra não deixar sessão sshd órfã do outro lado
                let _ = write_all_nb(&mut g.1, b"exit\n");
                let _ = g.1.send_eof();
                let deadline = std::time::Instant::now() + Duration::from_secs(1);
                let mut buf = [0u8; 4096];
                while !g.1.eof() && std::time::Instant::now() < deadline {
                    match g.1.read(&mut buf) {
                        Ok(0) => break,
                        Ok(_) => {}
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(20))
                        }
                        Err(_) => break,
                    }
                }
                g.1.close().ok();
                g.1.wait_close().ok();
                g.0.disconnect(None, "bye", None).ok();
            }
        }
        // derruba a sessão SFTP associada, se existir
        crate::sftp::drop_conn(&app, &server_id);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
