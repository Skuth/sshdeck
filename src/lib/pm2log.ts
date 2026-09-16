// Parser das linhas de log do pm2/Laravel pro detalhe do Monitor.
// Entrada: linhas prefixadas "O|" (stdout) / "E|" (stderr) pelo comando remoto.

export type LogTone = "err" | "warn" | "ok" | "info" | "plain";

export interface LogLine {
  stream: "out" | "err";
  ts?: string;
  tags: string[];
  msg: string;
  tone: LogTone;
  cont: boolean; // continuação (stack trace, linha indentada)
}

const TS_RE =
  /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(?:[+-]\d{2}:?\d{2}|Z))?)/;

/** Quebra "[ts][pid] env.LEVEL: msg" (Laravel/pm2) em partes; tolera formatos genéricos. */
export function parseLogLine(raw: string, stream: "out" | "err"): LogLine {
  let rest = raw;
  let ts: string | undefined;
  const tags: string[] = [];
  let m: RegExpMatchArray | null;
  const cont = /^(\s+|#\d+ |at |Stack trace|\[stacktrace\])/.test(rest);
  // prefixo do pm2 (--time) ou ISO solto: "2026-09-16 20:14:35 +00:00: msg"
  if ((m = rest.match(TS_RE))) {
    ts = m[1];
    rest = rest.slice(m[0].length).replace(/^:\s*/, "");
  }
  // grupos entre colchetes no início: [ts], [pid], [tag]
  while ((m = rest.match(/^\s*\[([^\]]{1,48})\]\s*/))) {
    const v = m[1].trim();
    if (!ts && TS_RE.test(v)) ts = v;
    else if (v) tags.push(v);
    rest = rest.slice(m[0].length);
  }
  // "local.ERROR:" / "production.INFO:" do Laravel
  if ((m = rest.match(/^(\w+)\.(\w+):\s*/))) {
    tags.push(m[2].toUpperCase());
    rest = rest.slice(m[0].length);
  }
  const probe = `${tags.join(" ")} ${rest}`;
  const tone: LogTone = cont
    ? "plain"
    : /error|exception|fail|fatal|critical|emergency|alert|panic/i.test(probe)
      ? "err"
      : /warn|deprecat|retry|timeout/i.test(probe)
        ? "warn"
        : /processed|success|done|complete|\bok\b|listening|started|online|ready/i.test(probe)
          ? "ok"
          : /processing|info|starting|notice|debug/i.test(probe)
            ? "info"
            : stream === "err"
              ? "err"
              : "plain";
  return { stream, ts, tags, msg: rest.trimEnd(), tone, cont };
}

export function tsShort(ts: string): string {
  const m = ts.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (!m) return ts;
  const today = new Date().toISOString().slice(0, 10);
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  return date === today ? m[4] : `${m[3]}/${m[2]} ${m[4]}`;
}

export function parsePm2Logs(raw: string): LogLine[] {
  const lines: LogLine[] = [];
  const lastTs: Record<"out" | "err", string> = { out: "", err: "" };
  for (const l of raw.split("\n")) {
    if ((!l.startsWith("O|") && !l.startsWith("E|")) || !l.slice(2).trim()) continue;
    const stream = l.startsWith("E|") ? "err" : "out";
    const line = parseLogLine(l.slice(2), stream);
    if (line.ts) lastTs[stream] = line.ts;
    lines.push(line);
  }
  // intercala stdout/stderr por horário (estável: linhas sem ts seguem a anterior do mesmo stream)
  const keyed = lines.map((ln, i) => {
    let key = ln.ts ?? "";
    if (!key)
      for (let j = i - 1; j >= 0; j--)
        if (lines[j].stream === ln.stream && lines[j].ts) {
          key = lines[j].ts!;
          break;
        }
    return { ln, key, i };
  });
  if (keyed.every((k) => k.key))
    keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i));
  return keyed.map((k) => k.ln);
}
