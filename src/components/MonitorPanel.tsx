import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, b64encode, formatBytes } from "@/lib/api";
import { useTabs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import FileEditor from "@/components/FileEditor";
import Truncated from "@/components/Truncated";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Copy,
  Cpu,
  FileText,
  Flame,
  HardDrive,
  LifeBuoy,
  Link2,
  ListOrdered,
  Loader2,
  MemoryStick,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCw,
  ScrollText,
  SquareTerminal,
  Terminal,
  Trash2,
  Unlink,
  X,
} from "lucide-react";

/* ---------- helpers ---------- */

function uptimeText(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Sparkline: linha 2px + área suave, dados reais acumulados no cliente. */
function Sparkline({ data, color, max }: { data: number[]; color: string; max?: number }) {
  const w = 120;
  const h = 32;
  if (data.length < 2)
    return <div className="h-8 w-30 rounded bg-muted/30" title="coletando dados…" />;
  const top = max ?? Math.max(...data, 0.0001);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 2 - Math.min(1, v / top) * (h - 4),
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function CapacityBar({ used, total, warnAt = 0.8 }: { used: number; total: number; warnAt?: number }) {
  const ratio = total > 0 ? used / total : 0;
  const color = ratio >= 0.92 ? "#f2778c" : ratio >= warnAt ? "#e8c26e" : "#57d9a3";
  return (
    <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden w-full">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function pctColor(v: number) {
  return v >= 80 ? "#f2778c" : v >= 50 ? "#e8c26e" : "#57d9a3";
}

/** Percentual com mini-barra colorida — pra tabelas de processo/container. */
function PctCell({ value }: { value: number }) {
  const color = pctColor(value);
  return (
    <span className="inline-flex items-center gap-1.5 justify-end w-full">
      <span className="tabular-nums" style={{ color }}>
        {value.toFixed(1)}%
      </span>
      <span className="h-1 w-10 rounded-full bg-muted/60 overflow-hidden shrink-0">
        <span
          className="block h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
        />
      </span>
    </span>
  );
}

/* ---------- dados do sistema ---------- */

const STATS_CMD = `cat /proc/loadavg; nproc; free -b | awk 'NR==2{print $2,$3}'; df -B1 / | awk 'NR==2{print $2,$3}'; cat /proc/uptime`;
const DETECT_CMD = `for c in pm2 nginx docker php composer node; do command -v $c >/dev/null 2>&1 && echo $c; done; [ -n "$(find /var/www /home -maxdepth 5 -type d -path '*storage/logs' 2>/dev/null | head -1)" ] && echo laravel; true`;
const VERSIONS_CMD = `echo "php|$(php -v 2>/dev/null | head -1)"
echo "php-instaladas|$(ls /etc/php 2>/dev/null | tr '\\n' ' ')"
echo "composer|$(composer --version --no-ansi 2>/dev/null)"
echo "node|$(node -v 2>/dev/null)"
echo "npm|$(npm -v 2>/dev/null)"
echo "pm2|$(pm2 -v 2>/dev/null)"
echo "nginx|$(nginx -v 2>&1)"
echo "docker|$(docker --version 2>/dev/null)"
echo "git|$(git --version 2>/dev/null)"
echo "os|$(. /etc/os-release 2>/dev/null && echo $PRETTY_NAME)"
true`;

interface StackItem {
  tool: string;
  version: string;
  full: string;
}

function parseVersions(raw: string): StackItem[] {
  return raw
    .trim()
    .split("\n")
    .flatMap((l) => {
      const [tool, ...rest] = l.split("|");
      const full = rest.join("|").trim();
      if (!full) return [];
      if (tool === "php-instaladas")
        return full
          .split(/\s+/)
          .filter(Boolean)
          .map((v) => ({ tool: "php", version: v, full: `PHP ${v} instalado em /etc/php` }));
      if (tool === "os") return [{ tool: "os", version: full, full }];
      const version = full.match(/\d+\.\d+[.\d]*/)?.[0] ?? full;
      return [{ tool, version, full }];
    });
}

/** Entradas de log do Laravel: [ts] env.LEVEL: mensagem + stack trace. */
interface LaravelEntry {
  ts: string;
  env: string;
  level: string;
  message: string;
  trace: string[];
}

function parseLaravelLog(section: string): LaravelEntry[] {
  const entries: LaravelEntry[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\[([\d\- :]+)\]\s+(\w+)\.(\w+):\s*(.*)$/);
    if (m) entries.push({ ts: m[1], env: m[2], level: m[3], message: m[4], trace: [] });
    else if (entries.length && line.trim()) entries[entries.length - 1].trace.push(line);
  }
  return entries.slice(-15).reverse(); // mais recentes primeiro
}

const LOG_LEVEL_COLOR: Record<string, string> = {
  ERROR: "#f2778c",
  CRITICAL: "#f2778c",
  ALERT: "#f2778c",
  EMERGENCY: "#f2778c",
  WARNING: "#e8c26e",
  NOTICE: "#6ea8f7",
  INFO: "#6ea8f7",
  DEBUG: "#8a93a8",
};

interface SysStats {
  load1: number;
  nproc: number;
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
  uptime: number;
}

function parseStats(raw: string): SysStats | null {
  const lines = raw.trim().split("\n");
  if (lines.length < 5) return null;
  const load1 = parseFloat(lines[0]);
  const nproc = parseInt(lines[1]);
  const [memTotal, memUsed] = lines[2].split(/\s+/).map(Number);
  const [diskTotal, diskUsed] = lines[3].split(/\s+/).map(Number);
  const uptime = parseFloat(lines[4]);
  if ([load1, nproc, memTotal, diskTotal, uptime].some(Number.isNaN)) return null;
  return { load1, nproc, memTotal, memUsed, diskTotal, diskUsed, uptime };
}

interface Pm2Proc {
  pm_id: number;
  name: string;
  monit: { cpu: number; memory: number };
  pm2_env: { status: string; restart_time: number; pm_uptime: number };
}

/** Processo PM2 que parece ser worker de fila. */
const isQueueWorker = (p: Pm2Proc) => /queue|worker|horizon|bull/i.test(p.name);

/* ---------- filas (Laravel: pendentes via Queue::size, falhas via failed_jobs) ---------- */

// ponytail: mede só a fila default de cada app; por-fila nomeada se precisarem
const QUEUES_CMD = `for a in $(find /var/www /home -maxdepth 4 -name artisan 2>/dev/null | head -3); do d=$(dirname "$a"); echo "==APP=> $d"; cd "$d" && timeout 15 php artisan tinker --execute='echo json_encode(["pending"=>Queue::size(),"failed"=>DB::table("failed_jobs")->count()]);' 2>/dev/null; echo; cd /; done; true`;

interface QueueApp {
  dir: string;
  name: string;
  pending: number;
  failed: number;
}

function parseQueues(raw: string): QueueApp[] {
  const apps: QueueApp[] = [];
  for (const sec of raw.split(/^==APP=> /m).filter(Boolean)) {
    const nl = sec.indexOf("\n");
    const dir = sec.slice(0, nl).trim();
    const jsonMatch = sec.slice(nl).match(/\{[^}]*\}/);
    if (!jsonMatch) continue;
    try {
      const j = JSON.parse(jsonMatch[0]);
      apps.push({
        dir,
        name: dir.split("/").pop() ?? dir,
        pending: Number(j.pending) || 0,
        failed: Number(j.failed) || 0,
      });
    } catch {
      /* app sem tinker/fila configurada — ignora */
    }
  }
  return apps;
}

const PM2_STATUS: Record<string, { label: string; color: string; Icon: typeof CircleCheck }> = {
  online: { label: "online", color: "#57d9a3", Icon: CircleCheck },
  stopped: { label: "parado", color: "#8a93a8", Icon: CircleDashed },
  errored: { label: "com erro", color: "#f2778c", Icon: CircleX },
};

/* ---------- ações rápidas (saída renderizada no próprio Monitor) ---------- */

interface QuickAction {
  id: string;
  label: string;
  tool?: "nginx" | "docker" | "laravel" | "php";
  cmd: string;
  /** comando alternativo pra "seguir ao vivo" no terminal (streaming) */
  followCmd?: string;
  /** auto-refresh em ms — resultado "ao vivo", sem clicar */
  live?: number;
}

const ACTIONS: QuickAction[] = [
  { id: "nginx-test", tool: "nginx", label: "Testar config", cmd: "sudo -n nginx -t 2>&1 || nginx -t 2>&1" },
  {
    id: "nginx-reload",
    tool: "nginx",
    label: "Reload",
    cmd: "(sudo -n nginx -s reload 2>&1 || nginx -s reload 2>&1) && echo __RELOAD_OK__",
  },
  {
    id: "nginx-log",
    tool: "nginx",
    label: "Log de erros",
    cmd: "sudo -n tail -n 80 /var/log/nginx/error.log 2>&1 || tail -n 80 /var/log/nginx/error.log 2>&1",
    followCmd: "sudo tail -f /var/log/nginx/error.log",
    live: 5000,
  },
  {
    id: "nginx-sites",
    tool: "nginx",
    label: "Sites",
    cmd: `for f in /etc/nginx/sites-available/*; do [ -e "$f" ] || continue; n=$(basename "$f"); if [ -e "/etc/nginx/sites-enabled/$n" ]; then echo "on|$f"; else echo "off|$f"; fi; done; ls -d1 /etc/nginx/conf.d/*.conf 2>/dev/null | sed 's/^/conf|/'; true`,
  },
  {
    id: "laravel-log",
    tool: "laravel",
    label: "Logs Laravel",
    cmd: `for f in $(find /var/www /home -maxdepth 6 -path '*storage/logs/*.log' 2>/dev/null | xargs ls -t 2>/dev/null | head -2); do echo "==FILE=> $f"; tail -n 120 "$f"; done`,
    live: 8000,
  },
  {
    id: "php-fpm-log",
    tool: "php",
    label: "Log PHP-FPM",
    cmd: "sudo -n sh -c 'tail -n 60 /var/log/php*fpm*.log' 2>/dev/null || tail -n 60 /var/log/php*fpm*.log 2>/dev/null; true",
  },
  { id: "docker-ps", tool: "docker", label: "Containers", cmd: "docker ps -a --format '{{json .}}'" },
  {
    id: "docker-stats",
    tool: "docker",
    label: "Uso por container",
    cmd: "docker stats --no-stream --format '{{json .}}'",
    live: 4000,
  },
  { id: "failed", label: "Serviços com falha", cmd: "systemctl --failed --no-legend --plain 2>&1; true" },
  { id: "du", label: "Disco por pasta", cmd: "du -sh /var/* /home/* 2>/dev/null | sort -rh | head -12" },
  { id: "ps", label: "Top processos", cmd: "ps aux --sort=-%cpu | head -13", live: 3000 },
];

/* ---------- renderizadores da saída ---------- */

function Mono({ text }: { text: string }) {
  return (
    <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all p-3 max-h-80 overflow-y-auto">
      {text.trim() || "(sem saída)"}
    </pre>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0">
          <tr className="bg-card text-[11px] text-muted-foreground text-left">
            {head.map((h) => (
              <th key={h} className="font-medium px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60 hover:bg-accent/30">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StateBanner({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm px-3 py-2.5",
        ok ? "text-[#57d9a3]" : "text-[#f2778c]",
      )}
    >
      {ok ? <CircleCheck className="size-4 shrink-0" /> : <CircleX className="size-4 shrink-0" />}
      {text}
    </div>
  );
}

interface ResultCtx {
  serverId: string;
  openFile: (path: string) => void;
  rerun: () => void;
}

function renderResult(action: QuickAction, out: string, ctx: ResultCtx): React.ReactNode {
  const trimmed = out.trim();
  switch (action.id) {
    case "nginx-test": {
      const ok = /syntax is ok/.test(trimmed) && /test is successful/.test(trimmed);
      return (
        <>
          <StateBanner ok={ok} text={ok ? "Configuração válida" : "Configuração com problema"} />
          <Mono text={trimmed} />
        </>
      );
    }
    case "nginx-reload": {
      const ok = trimmed.includes("__RELOAD_OK__");
      return ok ? (
        <StateBanner ok text="nginx recarregado com sucesso" />
      ) : (
        <>
          <StateBanner ok={false} text="Reload falhou — se pedir senha de sudo, rode pelo terminal" />
          <Mono text={trimmed} />
        </>
      );
    }
    case "nginx-sites":
      return <NginxSites raw={trimmed} ctx={ctx} />;
    case "docker-ps":
    case "docker-stats": {
      const rows = trimmed
        .split("\n")
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l)];
          } catch {
            return [];
          }
        });
      if (!rows.length) return <Mono text={trimmed} />;
      if (action.id === "docker-ps")
        return (
          <Table
            head={["Container", "Imagem", "Status", "Portas"]}
            rows={rows.map((r) => [
              <span className="font-medium">{r.Names}</span>,
              <span className="font-mono text-muted-foreground">{r.Image}</span>,
              <span
                className="inline-flex items-center gap-1"
                style={{ color: String(r.Status).startsWith("Up") ? "#57d9a3" : "#8a93a8" }}
              >
                {String(r.Status).startsWith("Up") ? (
                  <CircleCheck className="size-3" />
                ) : (
                  <CircleDashed className="size-3" />
                )}
                {r.Status}
              </span>,
              <span className="font-mono text-muted-foreground">{r.Ports || "—"}</span>,
            ])}
          />
        );
      return (
        <Table
          head={["Container", "CPU", "Memória", "Rede I/O"]}
          rows={rows.map((r) => {
            const cpu = parseFloat(String(r.CPUPerc).replace("%", "")) || 0;
            return [
              <span className="font-medium">{r.Name}</span>,
              <PctCell value={cpu} />,
              <span className="tabular-nums">{r.MemUsage}</span>,
              <span className="tabular-nums text-muted-foreground">{r.NetIO}</span>,
            ];
          })}
        />
      );
    }
    case "failed": {
      if (!trimmed || /^0 loaded units/.test(trimmed))
        return <StateBanner ok text="Nenhum serviço com falha 🎉" />;
      const rows = trimmed.split("\n").filter((l) => l.includes(".") && !l.startsWith("Legend"));
      if (!rows.length) return <StateBanner ok text="Nenhum serviço com falha 🎉" />;
      return (
        <Table
          head={["Unidade", "Estado", "Sub"]}
          rows={rows.map((l) => {
            const p = l.trim().split(/\s+/);
            return [
              <span className="font-mono text-[#f2778c]">{p[0]?.replace(/^●\s*/, "")}</span>,
              p[2] ?? "—",
              p[3] ?? "—",
            ];
          })}
        />
      );
    }
    case "du": {
      const rows = trimmed
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split(/\s+/, 2) as [string, string]);
      return (
        <Table
          head={["Tamanho", "Pasta"]}
          rows={rows.map(([size, dir]) => [
            <span className="tabular-nums font-medium">{size}</span>,
            <span className="font-mono text-muted-foreground">{dir}</span>,
          ])}
        />
      );
    }
    case "ps": {
      const lines = trimmed.split("\n").slice(1);
      return (
        <Table
          head={["Usuário", "PID", "CPU", "Memória", "Comando"]}
          rows={lines.map((l) => {
            const p = l.trim().split(/\s+/);
            return [
              p[0],
              <span className="tabular-nums text-muted-foreground">{p[1]}</span>,
              <PctCell value={parseFloat(p[2]) || 0} />,
              <PctCell value={parseFloat(p[3]) || 0} />,
              <span className="font-mono text-muted-foreground break-all">
                {p.slice(10).join(" ").slice(0, 120)}
              </span>,
            ];
          })}
        />
      );
    }
    case "laravel-log": {
      if (!trimmed)
        return <p className="text-sm text-muted-foreground p-3">Nenhum log de Laravel encontrado.</p>;
      const sections = trimmed.split(/^==FILE=> /m).filter(Boolean);
      return (
        <div className="max-h-96 overflow-y-auto grid gap-1 p-2">
          {sections.map((sec) => {
            const nl = sec.indexOf("\n");
            const file = sec.slice(0, nl).trim();
            const entries = parseLaravelLog(sec.slice(nl + 1));
            return (
              <div key={file}>
                <p className="text-[10px] font-mono text-muted-foreground px-1 py-1.5 truncate">
                  {file}
                </p>
                <div className="grid gap-1">
                  {entries.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 pb-2">arquivo vazio</p>
                  )}
                  {entries.map((e, i) => {
                    const color = LOG_LEVEL_COLOR[e.level.toUpperCase()] ?? "#8a93a8";
                    return (
                      <div key={i} className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-semibold uppercase rounded px-1.5 py-px"
                            style={{ color, backgroundColor: color + "1a" }}
                          >
                            {e.level}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {e.ts} · {e.env}
                          </span>
                        </div>
                        <p className="text-xs mt-1 break-all">{e.message}</p>
                        {e.trace.length > 0 && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                              stack trace ({e.trace.length} linhas)
                            </summary>
                            <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all mt-1 max-h-48 overflow-y-auto">
                              {e.trace.join("\n")}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    default:
      return <Mono text={trimmed} />;
  }
}

/* ---------- gerenciador de sites nginx ---------- */

const NGINX_TPL = {
  proxy: (domain: string, port: string) => `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`,
  static: (domain: string) => `server {
    listen 80;
    server_name ${domain};
    root /var/www/${domain};
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
`,
  vazio: () => "",
};

function NginxSites({ raw, ctx }: { raw: string; ctx: ResultCtx }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [tpl, setTpl] = useState<keyof typeof NGINX_TPL>("proxy");
  const [port, setPort] = useState("3000");
  const [busy, setBusy] = useState(false);

  const rows = raw
    .split("\n")
    .filter((l) => l.includes("|"))
    .map((l) => {
      const idx = l.indexOf("|");
      const state = l.slice(0, idx);
      const path = l.slice(idx + 1).trim();
      return { state, path, name: path.split("/").pop() ?? path };
    })
    .filter((r) => r.path);

  const sudoOr = (cmd: string) => `sudo -n ${cmd} 2>/dev/null || ${cmd}`;

  const toggle = async (row: { state: string; name: string }) => {
    setBusy(true);
    try {
      if (row.state === "on") {
        await api.sshExec(ctx.serverId, sudoOr(`rm '/etc/nginx/sites-enabled/${row.name}'`));
        toast.success(`"${row.name}" desativado — teste a config e dê reload`);
      } else {
        await api.sshExec(
          ctx.serverId,
          sudoOr(`ln -sf '/etc/nginx/sites-available/${row.name}' '/etc/nginx/sites-enabled/${row.name}'`),
        );
        toast.success(`"${row.name}" ativado — teste a config e dê reload`);
      }
      ctx.rerun();
    } catch (e) {
      toast.error(`${e} — precisa de sudo com senha? Faça pelo terminal.`);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = domain.trim();
    if (!name) return;
    setBusy(true);
    try {
      const path = `/etc/nginx/sites-available/${name}`;
      const content = tpl === "proxy" ? NGINX_TPL.proxy(name, port) : tpl === "static" ? NGINX_TPL.static(name) : "";
      const b64 = b64encode(content);
      await api.sshExec(
        ctx.serverId,
        `printf '%s' '${b64}' | base64 -d | sudo -n tee '${path}' >/dev/null 2>&1 || printf '%s' '${b64}' | base64 -d > '${path}'`,
      );
      toast.success(`Site "${name}" criado — revise a config e clique em Ativar`);
      setCreateOpen(false);
      setDomain("");
      ctx.rerun();
      ctx.openFile(path);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <span className="text-[11px] text-muted-foreground">
          {rows.filter((r) => r.state === "on").length} ativo(s) ·{" "}
          {rows.filter((r) => r.state === "off").length} inativo(s) — click em Editar pra abrir a
          config no editor
        </span>
        <Button size="sm" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" /> Novo site
        </Button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground p-3">Nenhum site — crie o primeiro!</p>
        )}
        {rows.map((r) => (
          <div
            key={r.path}
            className="flex items-center gap-2.5 px-3 py-2 border-b border-border/40 last:border-0 hover:bg-accent/30"
          >
            <span
              className="inline-flex items-center gap-1.5 text-[11px] w-16 shrink-0"
              style={{ color: r.state === "on" ? "#57d9a3" : r.state === "conf" ? "#6ea8f7" : "#8a93a8" }}
            >
              {r.state === "on" ? (
                <CircleCheck className="size-3" />
              ) : r.state === "conf" ? (
                <FileText className="size-3" />
              ) : (
                <CircleDashed className="size-3" />
              )}
              {r.state === "on" ? "ativo" : r.state === "conf" ? "conf.d" : "inativo"}
            </span>
            <Truncated
              text={r.name}
              tooltip={r.path}
              mono
              className="text-xs font-mono font-medium flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => ctx.openFile(r.path)}
            >
              <PencilLine className="size-3" /> Editar
            </Button>
            {r.state !== "conf" && (
              <Button
                variant={r.state === "on" ? "ghost" : "secondary"}
                size="sm"
                className="h-6 text-[11px] px-2"
                disabled={busy}
                onClick={() => toggle(r)}
              >
                {r.state === "on" ? (
                  <>
                    <Unlink className="size-3" /> Desativar
                  </>
                ) : (
                  <>
                    <Link2 className="size-3" /> Ativar
                  </>
                )}
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo site nginx</DialogTitle>
            <DialogDescription>
              Cria em sites-available com um template pronto; depois é só revisar e Ativar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Domínio / nome do arquivo</Label>
              <Input
                placeholder="api.meusite.com.br"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Template</Label>
              <div className="flex gap-1.5">
                {(
                  [
                    ["proxy", "Reverse proxy"],
                    ["static", "Site estático"],
                    ["vazio", "Vazio"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      tpl === key
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setTpl(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {tpl === "proxy" && (
              <div className="grid gap-1.5">
                <Label>Porta da aplicação (proxy_pass)</Label>
                <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} disabled={busy || !domain.trim()}>
              Criar e abrir no editor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- kit de ajuda ---------- */

interface Recipe {
  title: string;
  desc: string;
  steps: { text: string; cmd: string }[];
}

const RECIPES: Recipe[] = [
  {
    title: "Criar um usuário novo",
    desc: "Cria o usuário com home e senha (interativo).",
    steps: [
      { text: "Cria o usuário — vai pedir a senha nova:", cmd: "sudo adduser nomedousuario" },
    ],
  },
  {
    title: "Dar permissão de root (sudo)",
    desc: "Coloca o usuário no grupo sudo — vale a partir do próximo login.",
    steps: [
      { text: "Adiciona ao grupo sudo:", cmd: "sudo usermod -aG sudo nomedousuario" },
      { text: "Confere se funcionou:", cmd: "sudo -l -U nomedousuario" },
    ],
  },
  {
    title: "Liberar acesso SSH por chave",
    desc: "Autoriza uma chave pública pro usuário entrar sem senha.",
    steps: [
      {
        text: "Cria a pasta e o arquivo com as permissões certas:",
        cmd: "sudo -u nomedousuario sh -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'",
      },
      {
        text: "Cola a chave pública no final do arquivo:",
        cmd: "echo 'ssh-ed25519 AAAA... comentario' | sudo -u nomedousuario tee -a /home/nomedousuario/.ssh/authorized_keys",
      },
    ],
  },
  {
    title: "Trocar a senha de um usuário",
    desc: "Redefine a senha (interativo).",
    steps: [{ text: "Vai pedir a senha nova duas vezes:", cmd: "sudo passwd nomedousuario" }],
  },
  {
    title: "Firewall: liberar ou bloquear porta (ufw)",
    desc: "Abre a porta pro mundo ou remove a regra.",
    steps: [
      { text: "Libera a porta (ex.: 443):", cmd: "sudo ufw allow 443" },
      { text: "Vê as regras ativas:", cmd: "sudo ufw status numbered" },
      { text: "Remove uma regra pelo número:", cmd: "sudo ufw delete NUMERO" },
    ],
  },
  {
    title: "SSL grátis com certbot (Let's Encrypt)",
    desc: "Gera e instala o certificado direto na config do nginx, com renovação automática.",
    steps: [
      { text: "Instala o certbot (Ubuntu):", cmd: "sudo apt install -y certbot python3-certbot-nginx" },
      { text: "Emite e configura o certificado:", cmd: "sudo certbot --nginx -d meusite.com.br" },
      { text: "Testa a renovação automática:", cmd: "sudo certbot renew --dry-run" },
    ],
  },
  {
    title: "Ver quem acessou o servidor",
    desc: "Sessões ativas e últimos logins.",
    steps: [
      { text: "Quem está logado agora:", cmd: "who" },
      { text: "Últimos 10 logins:", cmd: "last -10" },
    ],
  },
];

function HelpKit({ runInTerminal }: { runInTerminal: (cmd: string) => void }) {
  const copy = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(
      () => toast.success("Comando copiado"),
      () => toast.error("Não deu pra copiar"),
    );
  };
  return (
    <div className="grid gap-1.5">
      {RECIPES.map((r) => (
        <details
          key={r.title}
          className="group rounded-xl border border-border bg-card/40 open:bg-card/60"
        >
          <summary className="flex items-center gap-2 px-3.5 py-2.5 cursor-pointer select-none text-sm">
            <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
            <span className="font-medium">{r.title}</span>
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              — {r.desc}
            </span>
          </summary>
          <div className="px-3.5 pb-3 grid gap-2">
            {r.steps.map((s) => (
              <div key={s.cmd} className="grid gap-1">
                <p className="text-xs text-muted-foreground">{s.text}</p>
                <div className="flex items-center gap-1.5 rounded-lg bg-[#0b0e14] border border-border/60 pl-3 pr-1.5 py-1.5">
                  <code className="text-xs font-mono flex-1 break-all text-[#57d9a3]">
                    {s.cmd}
                  </code>
                  <button
                    className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                    title="Copiar"
                    onClick={() => copy(s.cmd)}
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-primary p-1 shrink-0"
                    title="Rodar no terminal"
                    onClick={() => runInTerminal(s.cmd)}
                  >
                    <SquareTerminal className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/* ---------- painel ---------- */

export default function MonitorPanel({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const history = useRef<Record<string, number[]>>({});
  const [action, setAction] = useState<QuickAction | null>(null);
  const [editPath, setEditPath] = useState<string | null>(null);

  const push = (key: string, value: number) => {
    const arr = (history.current[key] ??= []);
    arr.push(value);
    if (arr.length > 40) arr.shift();
  };

  const { data: tools } = useQuery({
    queryKey: ["tools", serverId],
    queryFn: async () => (await api.sshExec(serverId, DETECT_CMD)).trim().split("\n").filter(Boolean),
    staleTime: Infinity,
  });

  const { data: stats } = useQuery({
    queryKey: ["sysstats", serverId],
    refetchInterval: 5000,
    queryFn: async () => {
      const s = parseStats(await api.sshExec(serverId, STATS_CMD));
      if (s) {
        push("load", s.load1);
        push("mem", s.memUsed);
      }
      return s;
    },
  });

  const { data: stack } = useQuery({
    queryKey: ["stack", serverId],
    staleTime: Infinity,
    queryFn: async () => parseVersions(await api.sshExec(serverId, VERSIONS_CMD)),
  });

  const hasPm2 = tools?.includes("pm2");
  const { data: pm2, isLoading: pm2Loading } = useQuery({
    queryKey: ["pm2", serverId],
    enabled: !!hasPm2,
    refetchInterval: 4000,
    queryFn: async () => {
      const raw = await api.sshExec(serverId, "pm2 jlist 2>/dev/null");
      const list: Pm2Proc[] = JSON.parse(raw.slice(raw.indexOf("[")));
      for (const p of list) push(`pm2:${p.pm_id}`, p.monit.cpu);
      return list;
    },
  });

  const hasLaravel = tools?.includes("laravel");
  const workers = (pm2 ?? []).filter(isQueueWorker);
  const { data: queues, isFetching: queuesLoading } = useQuery({
    queryKey: ["queues", serverId],
    enabled: !!hasLaravel,
    refetchInterval: 10000,
    queryFn: async () => {
      const apps = parseQueues(await api.sshExec(serverId, QUEUES_CMD));
      for (const a of apps) push(`q:${a.dir}`, a.pending);
      return apps;
    },
  });

  const [confirmFlush, setConfirmFlush] = useState<QueueApp | null>(null);

  const queueAction = async (app: QueueApp, cmd: string, okMsg: string) => {
    try {
      await api.sshExec(serverId, `cd '${app.dir}' && timeout 30 php artisan ${cmd} 2>&1`);
      toast.success(okMsg);
      queryClient.invalidateQueries({ queryKey: ["queues", serverId] });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const restartWorkers = async () => {
    try {
      // avisa os workers pra reiniciarem após o job atual + restart nos processos pm2
      for (const app of queues ?? [])
        await api.sshExec(serverId, `cd '${app.dir}' && php artisan queue:restart 2>/dev/null; true`);
      if (workers.length)
        await api.sshExec(serverId, `pm2 restart ${workers.map((w) => w.pm_id).join(" ")}`);
      toast.success("Workers reiniciados");
      queryClient.invalidateQueries({ queryKey: ["pm2", serverId] });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const {
    data: actionOut,
    isFetching: actionLoading,
    refetch: rerunAction,
  } = useQuery({
    queryKey: ["action", serverId, action?.id, action?.cmd],
    enabled: action !== null,
    staleTime: 0,
    refetchInterval: action?.live ?? false,
    queryFn: () => api.sshExec(serverId, action!.cmd),
  });

  /** Streaming (tail -f, pm2 logs…) continua no terminal, à vista. */
  const runInTerminal = (command: string) => {
    api.sshWrite(serverId, b64encode(command + "\n")).catch((e) => toast.error(String(e)));
    useTabs.getState().setView(serverId, "terminal");
  };

  const pm2Restart = async (p: Pm2Proc) => {
    try {
      await api.sshExec(serverId, `pm2 restart ${p.pm_id}`);
      toast.success(`"${p.name}" reiniciado`);
      queryClient.invalidateQueries({ queryKey: ["pm2", serverId] });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const online = pm2?.filter((p) => p.pm2_env.status === "online").length ?? 0;
  const cpuPct = stats ? Math.min(100, (stats.load1 / Math.max(1, stats.nproc)) * 100) : null;
  const actions = ACTIONS.filter((a) => !a.tool || tools?.includes(a.tool));

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0e1118]">
      <div className="max-w-4xl mx-auto p-5 grid gap-6">
        {/* KPIs do sistema */}
        <section>
          <div className="flex items-baseline justify-between mb-2.5">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="size-4 text-primary" /> Servidor
            </h2>
            <span className="text-[11px] text-muted-foreground">atualiza a cada 5s</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-border bg-card/60 p-3.5 grid gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Cpu className="size-3.5" /> CPU (load / {stats?.nproc ?? "?"} cores)
              </span>
              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold tabular-nums leading-none">
                  {stats ? stats.load1.toFixed(2) : "—"}
                </span>
                <Sparkline data={history.current["load"] ?? []} color="#6ea8f7" max={stats?.nproc} />
              </div>
              {cpuPct !== null && (
                <span className={cn("text-[11px]", cpuPct > 85 ? "text-[#f2778c]" : "text-muted-foreground")}>
                  {cpuPct.toFixed(0)}% da capacidade
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-3.5 grid gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <MemoryStick className="size-3.5" /> Memória
              </span>
              <div className="flex items-end justify-between gap-2">
                <span className="text-2xl font-semibold tabular-nums leading-none">
                  {stats ? formatBytes(stats.memUsed) : "—"}
                </span>
                <Sparkline data={history.current["mem"] ?? []} color="#c795f0" max={stats?.memTotal} />
              </div>
              {stats && (
                <>
                  <CapacityBar used={stats.memUsed} total={stats.memTotal} />
                  <span className="text-[11px] text-muted-foreground">
                    de {formatBytes(stats.memTotal)}
                  </span>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-3.5 grid gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="size-3.5" /> Disco (/)
              </span>
              <span className="text-2xl font-semibold tabular-nums leading-none">
                {stats ? formatBytes(stats.diskUsed) : "—"}
              </span>
              {stats && (
                <>
                  <CapacityBar used={stats.diskUsed} total={stats.diskTotal} />
                  <span className="text-[11px] text-muted-foreground">
                    de {formatBytes(stats.diskTotal)} (
                    {((stats.diskUsed / stats.diskTotal) * 100).toFixed(0)}%)
                  </span>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-3.5 grid gap-2">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5" /> Uptime
              </span>
              <span className="text-2xl font-semibold tabular-nums leading-none">
                {stats ? uptimeText(stats.uptime) : "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {stats && stats.uptime > 0
                  ? `desde ${new Date(Date.now() - stats.uptime * 1000).toLocaleDateString("pt-BR")}`
                  : "sem dados"}
              </span>
            </div>
          </div>
        </section>

        {/* Stack instalada */}
        {stack && stack.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-2.5">
              <Boxes className="size-4 text-primary" /> Stack instalada
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {stack.map((s, i) => (
                <span
                  key={`${s.tool}-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs",
                    s.tool === "os" && "border-primary/30 text-primary",
                  )}
                  title={s.full}
                >
                  <span className="font-medium">{s.tool === "os" ? "" : s.tool}</span>
                  <span className={cn("tabular-nums", s.tool !== "os" && "text-muted-foreground")}>
                    {s.version}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* PM2 */}
        {hasPm2 && (
          <section>
            <div className="flex items-baseline justify-between mb-2.5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <RotateCw className="size-4 text-primary" /> PM2
                <span className="text-[11px] font-normal text-muted-foreground">
                  {online}/{pm2?.length ?? 0} online
                </span>
              </h2>
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                onClick={() => runInTerminal("pm2 monit")}
              >
                abrir pm2 monit no terminal
              </button>
            </div>

            {pm2Loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                <Loader2 className="size-4 animate-spin" /> Carregando processos…
              </div>
            )}

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card/60 text-[11px] text-muted-foreground text-left">
                    <th className="font-medium px-3 py-2">Processo</th>
                    <th className="font-medium px-3 py-2">Status</th>
                    <th className="font-medium px-3 py-2 text-right">CPU</th>
                    <th className="font-medium px-3 py-2 w-32">Histórico</th>
                    <th className="font-medium px-3 py-2 text-right">Memória</th>
                    <th className="font-medium px-3 py-2 text-right">Restarts</th>
                    <th className="font-medium px-3 py-2 text-right">Uptime</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pm2?.map((p) => {
                    const st = PM2_STATUS[p.pm2_env.status] ?? {
                      label: p.pm2_env.status,
                      color: "#e8c26e",
                      Icon: AlertTriangle,
                    };
                    const up =
                      p.pm2_env.status === "online"
                        ? uptimeText((Date.now() - p.pm2_env.pm_uptime) / 1000)
                        : "—";
                    return (
                      <tr key={p.pm_id} className="border-t border-border hover:bg-accent/30">
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs"
                            style={{ color: st.color }}
                          >
                            <st.Icon className="size-3.5" /> {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.monit.cpu}%</td>
                        <td className="px-3 py-2">
                          <Sparkline
                            data={history.current[`pm2:${p.pm_id}`] ?? []}
                            color="#6ea8f7"
                            max={100}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatBytes(p.monit.memory)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {p.pm2_env.restart_time}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{up}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1 justify-end">
                            <button
                              className="text-muted-foreground hover:text-primary p-1"
                              title={`pm2 restart ${p.name}`}
                              onClick={() => pm2Restart(p)}
                            >
                              <RotateCw className="size-4" />
                            </button>
                            <button
                              className="text-muted-foreground hover:text-primary p-1"
                              title={`pm2 logs ${p.name} (abre no terminal)`}
                              onClick={() => runInTerminal(`pm2 logs ${p.name} --lines 50`)}
                            >
                              <ScrollText className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pm2 && pm2.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        pm2 instalado, mas nenhum processo gerenciado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Filas */}
        {(hasLaravel || workers.length > 0) && (
          <section>
            <div className="flex items-baseline justify-between mb-2.5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ListOrdered className="size-4 text-primary" /> Filas
                {workers.length > 0 && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {workers.filter((w) => w.pm2_env.status === "online").length}/{workers.length}{" "}
                    worker(s) online
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">atualiza a cada 10s</span>
                {(workers.length > 0 || (queues?.length ?? 0) > 0) && (
                  <Button variant="secondary" size="sm" className="h-6 text-[11px]" onClick={restartWorkers}>
                    <RotateCw className="size-3" /> Reiniciar workers
                  </Button>
                )}
              </div>
            </div>

            {workers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {workers.map((w) => {
                  const st = PM2_STATUS[w.pm2_env.status] ?? PM2_STATUS.stopped;
                  return (
                    <span
                      key={w.pm_id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs font-mono"
                      title={`pm2 id ${w.pm_id} — ${st.label}, ${w.pm2_env.restart_time} restarts`}
                    >
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                      {w.name}
                    </span>
                  );
                })}
              </div>
            )}

            {queuesLoading && !queues && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                <Loader2 className="size-4 animate-spin" /> Medindo filas dos apps Laravel…
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2.5">
              {queues?.map((q) => (
                <div key={q.dir} className="rounded-xl border border-border bg-card/60 p-3.5 grid gap-2.5">
                  <Truncated
                    text={q.name}
                    tooltip={q.dir}
                    mono
                    className="text-xs font-semibold"
                  />
                  <div className="flex items-end justify-between gap-3">
                    <div className="grid gap-0.5">
                      <span className="text-[11px] text-muted-foreground">jobs na fila</span>
                      <span
                        className={cn(
                          "text-2xl font-semibold tabular-nums leading-none",
                          q.pending > 500 && "text-[#e8c26e]",
                        )}
                      >
                        {q.pending.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <Sparkline data={history.current[`q:${q.dir}`] ?? []} color="#5fd0d8" />
                    <div className="grid gap-0.5 text-right">
                      <span className="text-[11px] text-muted-foreground">falhas</span>
                      <span
                        className={cn(
                          "text-2xl font-semibold tabular-nums leading-none",
                          q.failed > 0 ? "text-[#f2778c]" : "text-muted-foreground",
                        )}
                      >
                        {q.failed.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  {q.failed > 0 && (
                    <div className="flex gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 text-[11px] flex-1"
                        title="php artisan queue:retry all"
                        onClick={() =>
                          queueAction(q, "queue:retry all", `Falhas de "${q.name}" reenfileiradas`)
                        }
                      >
                        <RotateCw className="size-3" /> Reprocessar falhas
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-destructive hover:text-destructive"
                        title="php artisan queue:flush"
                        onClick={() => setConfirmFlush(q)}
                      >
                        <Trash2 className="size-3" /> Limpar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {queues && queues.length === 0 && (
                <p className="text-sm text-muted-foreground p-2 sm:col-span-2">
                  Nenhum app Laravel com fila mensurável encontrado (precisa do tinker disponível).
                </p>
              )}
            </div>

            <ConfirmDialog
              open={confirmFlush !== null}
              onOpenChange={(o) => !o && setConfirmFlush(null)}
              title="Apagar todas as falhas?"
              description={`As ${confirmFlush?.failed} falha(s) de "${confirmFlush?.name}" serão apagadas PERMANENTEMENTE (queue:flush). Sem desfazer.`}
              confirmLabel="Apagar falhas"
              onConfirm={() => {
                const q = confirmFlush!;
                setConfirmFlush(null);
                queueAction(q, "queue:flush", `Falhas de "${q.name}" apagadas`);
              }}
            />
          </section>
        )}

        {/* Ações rápidas */}
        <section>
          <div className="flex items-baseline justify-between mb-2.5">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Boxes className="size-4 text-primary" /> Ações rápidas
            </h2>
            <span className="text-[11px] text-muted-foreground">resultado aqui mesmo, formatado</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.id}
                variant={action?.id === a.id ? "default" : "secondary"}
                size="sm"
                className="h-8 text-xs"
                title={a.cmd}
                onClick={() => setAction(a)}
              >
                {a.tool === "nginx" && <FileText className="size-3.5" />}
                {a.tool === "docker" && <Boxes className="size-3.5" />}
                {(a.tool === "laravel" || a.tool === "php") && <Flame className="size-3.5" />}
                {!a.tool && <Terminal className="size-3.5" />}
                {a.tool ? `${a.tool}: ${a.label}` : a.label}
              </Button>
            ))}
          </div>

          {action && (
            <div className="mt-3 rounded-xl border border-border bg-card/40 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/60">
                <span className="text-xs font-semibold">
                  {action.tool ? `${action.tool}: ` : ""}
                  {action.label}
                </span>
                <Truncated
                  text={action.cmd}
                  mono
                  className="text-[10px] text-muted-foreground font-mono flex-1 max-w-[48ch]"
                />
                {action.live && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#57d9a3] shrink-0">
                    <span className="size-1.5 rounded-full bg-[#57d9a3] animate-pulse" />
                    ao vivo
                  </span>
                )}
                <button
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Rodar de novo"
                  onClick={() => rerunAction()}
                >
                  <RefreshCw className={cn("size-3.5", actionLoading && "animate-spin")} />
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground p-1"
                  title={
                    action.followCmd
                      ? "Seguir ao vivo no terminal"
                      : "Rodar no terminal"
                  }
                  onClick={() => runInTerminal(action.followCmd ?? action.cmd)}
                >
                  <SquareTerminal className="size-3.5" />
                </button>
                <button
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Fechar"
                  onClick={() => setAction(null)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {actionLoading && actionOut === undefined ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                  <Loader2 className="size-4 animate-spin" /> Executando…
                </div>
              ) : (
                renderResult(action, actionOut ?? "", {
                  serverId,
                  openFile: setEditPath,
                  rerun: () => rerunAction(),
                })
              )}
            </div>
          )}
        </section>

        {/* Kit de ajuda */}
        <section>
          <div className="flex items-baseline justify-between mb-2.5">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <LifeBuoy className="size-4 text-primary" /> Kit de ajuda
            </h2>
            <span className="text-[11px] text-muted-foreground">
              receitas prontas — copie ou rode no terminal
            </span>
          </div>
          <HelpKit runInTerminal={runInTerminal} />
        </section>
      </div>

      <FileEditor serverId={serverId} path={editPath} onClose={() => setEditPath(null)} />
    </div>
  );
}
