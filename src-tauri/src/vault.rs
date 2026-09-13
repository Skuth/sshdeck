// Vault criptografado em disco: "SDV1" + salt(16) + nonce(12) + AES-256-GCM(json).
// Chave derivada da senha-mestre com Argon2id. Fica decifrado só em memória.
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

const MAGIC: &[u8; 4] = b"SDV1";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Forward {
    pub id: String,
    pub label: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    /// "password" | "key"
    pub auth_type: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub key_path: Option<String>,
    #[serde(default)]
    pub key_passphrase: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub forwards: Vec<Forward>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultData {
    #[serde(default)]
    pub servers: Vec<Server>,
    #[serde(default)]
    pub snippets: Vec<Snippet>,
    #[serde(default)]
    pub tag_colors: std::collections::HashMap<String, String>,
}

pub struct Unlocked {
    key: [u8; 32],
    salt: [u8; 16],
    pub data: VaultData,
}

pub type VaultState = Mutex<Option<Unlocked>>;

fn vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vault.bin"))
}

fn derive_key(password: &str, salt: &[u8; 16]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    argon2::Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn save(app: &tauri::AppHandle, v: &Unlocked) -> Result<(), String> {
    let json = serde_json::to_vec(&v.data).map_err(|e| e.to_string())?;
    let cipher = Aes256Gcm::new_from_slice(&v.key).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; 12];
    getrandom(&mut nonce)?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), json.as_slice())
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(4 + 16 + 12 + ct.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&v.salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    let path = vault_path(app)?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, &out).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn getrandom(buf: &mut [u8]) -> Result<(), String> {
    use aes_gcm::aead::rand_core::RngCore;
    aes_gcm::aead::OsRng.fill_bytes(buf);
    Ok(())
}

const TAG_PALETTE: [&str; 8] = [
    "#57d9a3", "#6ea8f7", "#c795f0", "#e8c26e", "#f2778c", "#5fd0d8", "#f09a5f", "#8a93a8",
];

/// Toda tag usada por algum servidor ganha uma cor padrão da paleta.
fn ensure_tag_colors(d: &mut VaultData) {
    let tags: Vec<String> = d.servers.iter().flat_map(|s| s.tags.clone()).collect();
    for tag in tags {
        if !d.tag_colors.contains_key(&tag) {
            let c = TAG_PALETTE[d.tag_colors.len() % TAG_PALETTE.len()];
            d.tag_colors.insert(tag, c.into());
        }
    }
}

/// Roda `f` com o vault destravado e persiste a mudança.
pub fn with_vault<T>(
    app: &tauri::AppHandle,
    f: impl FnOnce(&mut VaultData) -> T,
) -> Result<T, String> {
    let state = app.state::<VaultState>();
    let mut guard = state.lock().unwrap();
    let v = guard.as_mut().ok_or("Vault está travado")?;
    let out = f(&mut v.data);
    ensure_tag_colors(&mut v.data);
    save(app, v)?;
    Ok(out)
}

pub fn get_server(app: &tauri::AppHandle, server_id: &str) -> Result<Server, String> {
    let state = app.state::<VaultState>();
    let guard = state.lock().unwrap();
    let v = guard.as_ref().ok_or("Vault está travado")?;
    v.data
        .servers
        .iter()
        .find(|s| s.id == server_id)
        .cloned()
        .ok_or_else(|| "Servidor não encontrado".into())
}

/// Upsert com dedupe por host+porta+usuário; id vazio ganha um estável.
fn merge_servers(data: &mut VaultData, servers: Vec<Server>) -> usize {
    let n = servers.len();
    for mut srv in servers {
        if srv.id.is_empty() {
            srv.id = format!("{}:{}:{}", srv.host, srv.port, srv.username);
        }
        match data
            .servers
            .iter_mut()
            .find(|s| s.host == srv.host && s.port == srv.port && s.username == srv.username)
        {
            Some(s) => {
                srv.id = s.id.clone();
                *s = srv;
            }
            None => data.servers.push(srv),
        }
    }
    n
}

/// Se existir um `import.json` na pasta de dados, importa e renomeia pra .done.
/// Permite semear servidores sem passar pela UI.
fn apply_seed(app: &tauri::AppHandle, v: &mut Unlocked) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let path = dir.join("import.json");
    let Ok(bytes) = fs::read(&path) else { return };
    match serde_json::from_slice::<Vec<Server>>(&bytes) {
        Ok(servers) if !servers.is_empty() => {
            merge_servers(&mut v.data, servers);
            ensure_tag_colors(&mut v.data);
            let _ = save(app, v);
            let _ = fs::rename(&path, dir.join("import.json.done"));
        }
        _ => {}
    }
}

#[tauri::command]
pub fn vault_status(app: tauri::AppHandle, state: tauri::State<VaultState>) -> String {
    if state.lock().unwrap().is_some() {
        return "unlocked".into();
    }
    match vault_path(&app) {
        Ok(p) if p.exists() => "locked".into(),
        _ => "missing".into(),
    }
}

#[tauri::command]
pub fn vault_create(
    app: tauri::AppHandle,
    state: tauri::State<VaultState>,
    password: String,
) -> Result<(), String> {
    if vault_path(&app)?.exists() {
        return Err("Vault já existe".into());
    }
    if password.len() < 4 {
        return Err("Senha-mestre muito curta".into());
    }
    let mut salt = [0u8; 16];
    getrandom(&mut salt)?;
    let key = derive_key(&password, &salt)?;
    let mut v = Unlocked { key, salt, data: VaultData::default() };
    save(&app, &v)?;
    apply_seed(&app, &mut v);
    *state.lock().unwrap() = Some(v);
    Ok(())
}

#[tauri::command]
pub fn vault_unlock(
    app: tauri::AppHandle,
    state: tauri::State<VaultState>,
    password: String,
) -> Result<VaultData, String> {
    let raw = fs::read(vault_path(&app)?).map_err(|e| e.to_string())?;
    if raw.len() < 32 || &raw[..4] != MAGIC {
        return Err("Arquivo de vault inválido".into());
    }
    let mut salt = [0u8; 16];
    salt.copy_from_slice(&raw[4..20]);
    let key = derive_key(&password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let json = cipher
        .decrypt(Nonce::from_slice(&raw[20..32]), &raw[32..])
        .map_err(|_| "Senha-mestre incorreta")?;
    let data: VaultData = serde_json::from_slice(&json).map_err(|e| e.to_string())?;
    let mut v = Unlocked { key, salt, data };
    apply_seed(&app, &mut v);
    let data = v.data.clone();
    *state.lock().unwrap() = Some(v);
    Ok(data)
}

/// Reconfirma a senha-mestre (usada pra liberar export com senhas).
#[tauri::command]
pub fn verify_master_password(
    state: tauri::State<VaultState>,
    password: String,
) -> Result<bool, String> {
    let guard = state.lock().unwrap();
    let v = guard.as_ref().ok_or("Vault está travado")?;
    Ok(derive_key(&password, &v.salt)? == v.key)
}

#[tauri::command]
pub fn vault_lock(state: tauri::State<VaultState>) {
    *state.lock().unwrap() = None;
}

#[tauri::command]
pub fn get_vault(state: tauri::State<VaultState>) -> Result<VaultData, String> {
    let guard = state.lock().unwrap();
    guard
        .as_ref()
        .map(|v| v.data.clone())
        .ok_or("Vault está travado".into())
}

#[tauri::command]
pub fn save_server(app: tauri::AppHandle, server: Server) -> Result<(), String> {
    with_vault(&app, |d| {
        match d.servers.iter_mut().find(|s| s.id == server.id) {
            Some(s) => *s = server,
            None => d.servers.push(server),
        }
    })
}

#[tauri::command]
pub fn delete_server(app: tauri::AppHandle, id: String) -> Result<(), String> {
    with_vault(&app, |d| d.servers.retain(|s| s.id != id))
}

#[tauri::command]
pub fn import_servers(app: tauri::AppHandle, servers: Vec<Server>) -> Result<usize, String> {
    with_vault(&app, |d| merge_servers(d, servers))
}

#[tauri::command]
pub fn set_tag_color(app: tauri::AppHandle, tag: String, color: String) -> Result<(), String> {
    with_vault(&app, |d| {
        if color.is_empty() {
            d.tag_colors.remove(&tag);
        } else {
            d.tag_colors.insert(tag, color);
        }
    })
}

/// Remove a tag de todos os servidores e do registro de cores.
#[tauri::command]
pub fn delete_tag(app: tauri::AppHandle, tag: String) -> Result<(), String> {
    with_vault(&app, |d| {
        for s in d.servers.iter_mut() {
            s.tags.retain(|t| *t != tag);
        }
        d.tag_colors.remove(&tag);
    })
}

/// Persiste a ordem exibida; ids desconhecidos vão pro fim.
#[tauri::command]
pub fn reorder_servers(app: tauri::AppHandle, ids: Vec<String>) -> Result<(), String> {
    with_vault(&app, |d| {
        d.servers
            .sort_by_key(|s| ids.iter().position(|i| *i == s.id).unwrap_or(usize::MAX));
    })
}

#[tauri::command]
pub fn save_snippet(app: tauri::AppHandle, snippet: Snippet) -> Result<(), String> {
    with_vault(&app, |d| {
        match d.snippets.iter_mut().find(|s| s.id == snippet.id) {
            Some(s) => *s = snippet,
            None => d.snippets.push(snippet),
        }
    })
}

#[tauri::command]
pub fn delete_snippet(app: tauri::AppHandle, id: String) -> Result<(), String> {
    with_vault(&app, |d| d.snippets.retain(|s| s.id != id))
}
