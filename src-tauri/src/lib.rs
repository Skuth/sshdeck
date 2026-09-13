mod forward;
mod sftp;
mod ssh;
mod vault;

/// Leitura de arquivo local (import CSV/JSON) sem precisar do plugin fs.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Escrita de arquivo local (export de servidores).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(vault::VaultState::default())
        .manage(ssh::TermState::default())
        .manage(sftp::SftpState::default())
        .manage(forward::ForwardState::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            vault::vault_status,
            vault::verify_master_password,
            vault::vault_create,
            vault::vault_unlock,
            vault::vault_lock,
            vault::get_vault,
            vault::save_server,
            vault::delete_server,
            vault::import_servers,
            vault::set_tag_color,
            vault::delete_tag,
            vault::reorder_servers,
            vault::save_snippet,
            vault::delete_snippet,
            ssh::ssh_connect,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            sftp::sftp_list,
            sftp::sftp_home,
            sftp::sftp_download,
            sftp::sftp_download_dir,
            sftp::sftp_read_text,
            sftp::sftp_write_text,
            sftp::sftp_upload,
            sftp::sftp_mkdir,
            sftp::sftp_rename,
            sftp::sftp_remove,
            forward::forward_start,
            forward::forward_stop,
            forward::forward_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
