// SFTP: uma sessão SSH dedicada (blocking) por servidor, criada sob demanda.
// ponytail: Mutex serializa operações — 1 transferência por servidor por vez.
use serde::Serialize;
use ssh2::Session;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

pub struct SftpConn {
    inner: Arc<Mutex<(Session, ssh2::Sftp)>>,
}

pub type SftpState = Mutex<HashMap<String, SftpConn>>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    name: String,
    path: String,
    size: u64,
    is_dir: bool,
    mtime: u64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    server_id: String,
    file: String,
    transferred: u64,
    total: u64,
    done: bool,
}

fn get_conn(app: &tauri::AppHandle, server_id: &str) -> Result<Arc<Mutex<(Session, ssh2::Sftp)>>, String> {
    let state = app.state::<SftpState>();
    if let Some(c) = state.lock().unwrap().get(server_id) {
        return Ok(c.inner.clone());
    }
    let srv = crate::vault::get_server(app, server_id)?;
    let sess = crate::ssh::open_session(app, &srv, None)?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP falhou: {e}"))?;
    let inner = Arc::new(Mutex::new((sess, sftp)));
    state
        .lock()
        .unwrap()
        .insert(server_id.into(), SftpConn { inner: inner.clone() });
    Ok(inner)
}

pub fn drop_conn(app: &tauri::AppHandle, server_id: &str) {
    app.state::<SftpState>().lock().unwrap().remove(server_id);
}

#[tauri::command]
pub async fn sftp_list(
    app: tauri::AppHandle,
    server_id: String,
    path: String,
) -> Result<Vec<SftpEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        let entries = g.1.readdir(Path::new(&path)).map_err(|e| e.to_string())?;
        let mut out: Vec<SftpEntry> = entries
            .into_iter()
            .filter_map(|(p, stat)| {
                let name = p.file_name()?.to_string_lossy().into_owned();
                Some(SftpEntry {
                    path: p.to_string_lossy().into_owned(),
                    name,
                    size: stat.size.unwrap_or(0),
                    is_dir: stat.is_dir(),
                    mtime: stat.mtime.unwrap_or(0),
                })
            })
            .collect();
        out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_home(app: tauri::AppHandle, server_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        let p = g.1.realpath(Path::new(".")).map_err(|e| e.to_string())?;
        Ok(p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_download(
    app: tauri::AppHandle,
    server_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        let mut remote = g.1.open(Path::new(&remote_path)).map_err(|e| e.to_string())?;
        let total = remote.stat().map_err(|e| e.to_string())?.size.unwrap_or(0);
        let mut local = std::fs::File::create(&local_path).map_err(|e| e.to_string())?;
        pump(&app, &server_id, &remote_path, &mut remote, &mut local, total)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_upload(
    app: tauri::AppHandle,
    server_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        let mut local = std::fs::File::open(&local_path).map_err(|e| e.to_string())?;
        let total = local.metadata().map_err(|e| e.to_string())?.len();
        let mut remote = g.1.create(Path::new(&remote_path)).map_err(|e| e.to_string())?;
        pump(&app, &server_id, &remote_path, &mut local, &mut remote, total)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn pump(
    app: &tauri::AppHandle,
    server_id: &str,
    file: &str,
    src: &mut impl Read,
    dst: &mut impl Write,
    total: u64,
) -> Result<(), String> {
    let mut buf = [0u8; 128 * 1024];
    let mut transferred = 0u64;
    let mut last_emit = std::time::Instant::now();
    loop {
        let n = src.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        transferred += n as u64;
        if last_emit.elapsed().as_millis() > 150 {
            last_emit = std::time::Instant::now();
            let _ = app.emit(
                "sftp:progress",
                Progress {
                    server_id: server_id.into(),
                    file: file.into(),
                    transferred,
                    total,
                    done: false,
                },
            );
        }
    }
    let _ = app.emit(
        "sftp:progress",
        Progress {
            server_id: server_id.into(),
            file: file.into(),
            transferred,
            total,
            done: true,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn sftp_mkdir(app: tauri::AppHandle, server_id: String, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        g.1.mkdir(Path::new(&path), 0o755).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_remove(
    app: tauri::AppHandle,
    server_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        if is_dir {
            g.1.rmdir(Path::new(&path)).map_err(|e| e.to_string())
        } else {
            g.1.unlink(Path::new(&path)).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
