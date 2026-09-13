import { invoke } from "@tauri-apps/api/core";

export interface Forward {
  id: string;
  label: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key";
  password?: string | null;
  keyPath?: string | null;
  keyPassphrase?: string | null;
  tags: string[];
  forwards: Forward[];
}

export interface Snippet {
  id: string;
  name: string;
  command: string;
}

export interface VaultData {
  servers: Server[];
  snippets: Snippet[];
  tagColors: Record<string, string>;
}

export interface SftpEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  mtime: number;
}

export interface SftpProgress {
  serverId: string;
  file: string;
  transferred: number;
  total: number;
  done: boolean;
}

export interface ActiveForward {
  forwardId: string;
  serverId: string;
  label: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export type VaultStatus = "missing" | "locked" | "unlocked";

export const api = {
  vaultStatus: () => invoke<VaultStatus>("vault_status"),
  vaultCreate: (password: string) => invoke<void>("vault_create", { password }),
  vaultUnlock: (password: string) => invoke<VaultData>("vault_unlock", { password }),
  vaultLock: () => invoke<void>("vault_lock"),
  verifyMasterPassword: (password: string) =>
    invoke<boolean>("verify_master_password", { password }),
  writeTextFile: (path: string, content: string) =>
    invoke<void>("write_text_file", { path, content }),
  getVault: () => invoke<VaultData>("get_vault"),
  saveServer: (server: Server) => invoke<void>("save_server", { server }),
  deleteServer: (id: string) => invoke<void>("delete_server", { id }),
  importServers: (servers: Server[]) => invoke<number>("import_servers", { servers }),
  setTagColor: (tag: string, color: string) => invoke<void>("set_tag_color", { tag, color }),
  deleteTag: (tag: string) => invoke<void>("delete_tag", { tag }),
  reorderServers: (ids: string[]) => invoke<void>("reorder_servers", { ids }),
  saveSnippet: (snippet: Snippet) => invoke<void>("save_snippet", { snippet }),
  deleteSnippet: (id: string) => invoke<void>("delete_snippet", { id }),

  sshConnect: (serverId: string, cols: number, rows: number) =>
    invoke<void>("ssh_connect", { serverId, cols, rows }),
  sshWrite: (serverId: string, data: string) => invoke<void>("ssh_write", { serverId, data }),
  sshResize: (serverId: string, cols: number, rows: number) =>
    invoke<void>("ssh_resize", { serverId, cols, rows }),
  sshDisconnect: (serverId: string) => invoke<void>("ssh_disconnect", { serverId }),

  sftpList: (serverId: string, path: string) =>
    invoke<SftpEntry[]>("sftp_list", { serverId, path }),
  sftpHome: (serverId: string) => invoke<string>("sftp_home", { serverId }),
  sftpDownload: (serverId: string, remotePath: string, localPath: string) =>
    invoke<void>("sftp_download", { serverId, remotePath, localPath }),
  sftpDownloadDir: (serverId: string, remotePath: string, localPath: string) =>
    invoke<number>("sftp_download_dir", { serverId, remotePath, localPath }),
  sftpUpload: (serverId: string, localPath: string, remotePath: string) =>
    invoke<void>("sftp_upload", { serverId, localPath, remotePath }),
  sftpReadText: (serverId: string, path: string) =>
    invoke<string>("sftp_read_text", { serverId, path }),
  sftpWriteText: (serverId: string, path: string, content: string) =>
    invoke<void>("sftp_write_text", { serverId, path, content }),
  sftpMkdir: (serverId: string, path: string) => invoke<void>("sftp_mkdir", { serverId, path }),
  sftpRename: (serverId: string, from: string, to: string) =>
    invoke<void>("sftp_rename", { serverId, from, to }),
  sftpRemove: (serverId: string, path: string, isDir: boolean) =>
    invoke<void>("sftp_remove", { serverId, path, isDir }),

  forwardStart: (serverId: string, forwardId: string) =>
    invoke<ActiveForward>("forward_start", { serverId, forwardId }),
  forwardStop: (forwardId: string) => invoke<void>("forward_stop", { forwardId }),
  forwardList: () => invoke<ActiveForward[]>("forward_list"),
};

export function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  let v = n;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i]}`;
}
