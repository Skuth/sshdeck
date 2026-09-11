import type { Server } from "./api";

// parser CSV mínimo com suporte a aspas
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Aceita JSON (array de objetos) ou CSV com cabeçalho. Lança em formato inválido. */
export function parseServers(text: string, makeId: () => string): Server[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  let raw: Record<string, unknown>[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const json = JSON.parse(trimmed);
    raw = Array.isArray(json) ? json : [json];
  } else {
    const rows = parseCsv(trimmed);
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    raw = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  }
  return raw
    .map((r): Server | null => {
      const host = String(r.host ?? r.address ?? r.hostname ?? "").trim();
      if (!host) return null;
      const username = String(r.username ?? r.user ?? r.login ?? "root").trim();
      const keyPath = String(r.keypath ?? r.key_path ?? r.key ?? "").trim();
      const tags = Array.isArray(r.tags)
        ? (r.tags as string[])
        : String(r.tags ?? "")
            .split(/[;|]/)
            .map((t) => t.trim())
            .filter(Boolean);
      return {
        id: makeId(),
        name: String(r.name ?? r.label ?? "").trim() || `${username}@${host}`,
        host,
        port: Number(r.port) || 22,
        username,
        authType: keyPath ? "key" : "password",
        password: String(r.password ?? r.pass ?? ""),
        keyPath: keyPath || null,
        keyPassphrase: String(r.keypassphrase ?? r.passphrase ?? "") || null,
        tags,
        forwards: [],
      };
    })
    .filter((s): s is Server => s !== null);
}
