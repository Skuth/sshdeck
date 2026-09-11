// Port forwarding local (-L). Cada forward ativo tem sua própria sessão SSH e
// uma única thread non-blocking que aceita conexões e bombeia bytes.
// ponytail: escrita usa retry bloqueante dentro da thread do forward — um peer
// travado pausa as outras conexões DESSE forward; separar por conexão se doer.
use serde::Serialize;
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};

pub struct ForwardHandle {
    stop: Arc<AtomicBool>,
    pub info: ActiveForward,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveForward {
    pub forward_id: String,
    pub server_id: String,
    pub label: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

pub type ForwardState = Mutex<HashMap<String, ForwardHandle>>;

#[tauri::command]
pub async fn forward_start(
    app: tauri::AppHandle,
    server_id: String,
    forward_id: String,
) -> Result<ActiveForward, String> {
    {
        let fwds = app.state::<ForwardState>();
        if fwds.lock().unwrap().contains_key(&forward_id) {
            return Err("Forward já está ativo".into());
        }
    }
    let srv = crate::vault::get_server(&app, &server_id)?;
    let fwd = srv
        .forwards
        .iter()
        .find(|f| f.id == forward_id)
        .cloned()
        .ok_or("Forward não encontrado")?;

    tauri::async_runtime::spawn_blocking(move || {
        let sess = crate::ssh::open_session(&app, &srv, None)?;
        let listener = TcpListener::bind(("127.0.0.1", fwd.local_port))
            .map_err(|e| format!("Porta local {} indisponível: {e}", fwd.local_port))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        sess.set_blocking(false);

        let stop = Arc::new(AtomicBool::new(true));
        let info = ActiveForward {
            forward_id: forward_id.clone(),
            server_id: server_id.clone(),
            label: fwd.label.clone(),
            local_port: fwd.local_port,
            remote_host: fwd.remote_host.clone(),
            remote_port: fwd.remote_port,
        };
        app.state::<ForwardState>().lock().unwrap().insert(
            forward_id.clone(),
            ForwardHandle { stop: stop.clone(), info: info.clone() },
        );

        let thread_app = app.clone();
        std::thread::spawn(move || {
            let mut conns: Vec<(TcpStream, ssh2::Channel)> = Vec::new();
            let mut buf = [0u8; 32 * 1024];
            while stop.load(Ordering::Relaxed) {
                let mut idle = true;
                // novas conexões locais
                match listener.accept() {
                    Ok((tcp, _)) => {
                        tcp.set_nonblocking(true).ok();
                        // criação do canal pode retornar WouldBlock — retry
                        let ch = loop {
                            match sess.channel_direct_tcpip(&fwd.remote_host, fwd.remote_port, None) {
                                Ok(ch) => break Some(ch),
                                Err(e) if e.code() == ssh2::ErrorCode::Session(-37) => {
                                    std::thread::sleep(Duration::from_millis(3));
                                }
                                Err(_) => break None,
                            }
                        };
                        if let Some(ch) = ch {
                            conns.push((tcp, ch));
                            idle = false;
                        }
                    }
                    Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                    Err(_) => break,
                }
                // bombeia bytes nas duas direções
                conns.retain_mut(|(tcp, ch)| {
                    loop {
                        match ch.read(&mut buf) {
                            Ok(0) => return false,
                            Ok(n) => {
                                idle = false;
                                if write_retry(tcp, &buf[..n]).is_err() {
                                    return false;
                                }
                            }
                            Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                            Err(_) => return false,
                        }
                    }
                    if ch.eof() {
                        return false;
                    }
                    loop {
                        match tcp.read(&mut buf) {
                            Ok(0) => return false,
                            Ok(n) => {
                                idle = false;
                                if write_retry_ch(ch, &buf[..n]).is_err() {
                                    return false;
                                }
                            }
                            Err(e) if e.kind() == ErrorKind::WouldBlock => break,
                            Err(_) => return false,
                        }
                    }
                    true
                });
                if idle {
                    std::thread::sleep(Duration::from_millis(5));
                }
            }
            thread_app
                .state::<ForwardState>()
                .lock()
                .unwrap()
                .remove(&forward_id);
            let _ = thread_app.emit("forward:stopped", forward_id.clone());
        });
        Ok(info)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn write_retry(w: &mut impl Write, mut data: &[u8]) -> std::io::Result<()> {
    while !data.is_empty() {
        match w.write(data) {
            Ok(n) => data = &data[n..],
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(2))
            }
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

fn write_retry_ch(ch: &mut ssh2::Channel, data: &[u8]) -> std::io::Result<()> {
    write_retry(ch, data)
}

#[tauri::command]
pub fn forward_stop(app: tauri::AppHandle, forward_id: String) {
    let fwds = app.state::<ForwardState>();
    let guard = fwds.lock().unwrap();
    if let Some(h) = guard.get(&forward_id) {
        h.stop.store(false, Ordering::Relaxed);
    }
    drop(guard);
}

#[tauri::command]
pub fn forward_list(app: tauri::AppHandle) -> Vec<ActiveForward> {
    app.state::<ForwardState>()
        .lock()
        .unwrap()
        .values()
        .map(|h| h.info.clone())
        .collect()
}
