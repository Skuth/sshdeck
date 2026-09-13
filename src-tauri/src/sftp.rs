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
        pump(&app, &server_id, &remote_path, &mut remote, &mut local, total, 0)?;
        emit_done(&app, &server_id, &remote_path, total);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn walk(
    sftp: &ssh2::Sftp,
    dir: &Path,
    files: &mut Vec<(std::path::PathBuf, u64)>,
    total: &mut u64,
) -> Result<(), String> {
    for (p, stat) in sftp.readdir(dir).map_err(|e| e.to_string())? {
        if stat.is_dir() {
            walk(sftp, &p, files, total)?;
        } else {
            let size = stat.size.unwrap_or(0);
            *total += size;
            files.push((p, size));
        }
    }
    Ok(())
}

/// Baixa uma pasta remota inteira (recursivo) pra `local_path`.
/// Retorna quantos itens foram pulados (ex.: symlinks quebrados).
#[tauri::command]
pub async fn sftp_download_dir(
    app: tauri::AppHandle,
    server_id: String,
    remote_path: String,
    local_path: String,
) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = get_conn(&app, &server_id)?;
        let g = conn.lock().unwrap();
        let base = Path::new(&remote_path);
        let mut files = Vec::new();
        let mut total = 0u64;
        walk(&g.1, base, &mut files, &mut total)?;
        let dest = Path::new(&local_path);
        std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
        let mut done = 0u64;
        let mut skipped = 0u64;
        for (remote, _) in &files {
            let rel = remote.strip_prefix(base).map_err(|e| e.to_string())?;
            let target = dest.join(rel);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut rf = match g.1.open(remote) {
                Ok(f) => f,
                Err(_) => {
                    skipped += 1;
                    continue;
                }
            };
            let mut lf = std::fs::File::create(&target).map_err(|e| e.to_string())?;
            done = pump(&app, &server_id, &remote.to_string_lossy(), &mut rf, &mut lf, total, done)?;
        }
        emit_done(&app, &server_id, &remote_path, total);
        Ok(skipped)
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
        pump(&app, &server_id, &remote_path, &mut local, &mut remote, total, 0)?;
        emit_done(&app, &server_id, &remote_path, total);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copia src→dst emitindo progresso; `base` é o acumulado de arquivos anteriores
/// (transferências de pasta). Retorna o acumulado final.
fn pump(
    app: &tauri::AppHandle,
    server_id: &str,
    file: &str,
    src: &mut impl Read,
    dst: &mut impl Write,
    total: u64,
    base: u64,
) -> Result<u64, String> {
    let mut buf = [0u8; 128 * 1024];
    let mut transferred = base;
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
    Ok(transferred)
}

fn emit_done(app: &tauri::AppHandle, server_id: &str, file: &str, total: u64) {
    let _ = app.emit(
        "sftp:progress",
        Progress {
            server_id: server_id.into(),
            file: file.into(),
            transferred: total,
            total,
            done: true,
        },
    );
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
