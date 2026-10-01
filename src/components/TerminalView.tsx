import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { api, b64decode, b64encode } from "@/lib/api";
import { EDIT_PREFIX, HOOK_READY, SHELL_HOOK } from "@/lib/shellHook";
import { termCwd, useTabs } from "@/lib/store";
import ConnectingOverlay from "@/components/ConnectingOverlay";
import FileEditor from "@/components/FileEditor";

const THEME = {
  background: "#0b0e14",
  foreground: "#d6dae4",
  cursor: "#57d9a3",
  cursorAccent: "#0b0e14",
  selectionBackground: "#2b3242",
  black: "#1c2028",
  red: "#f2778c",
  green: "#57d9a3",
  yellow: "#e8c26e",
  blue: "#6ea8f7",
  magenta: "#c795f0",
  cyan: "#5fd0d8",
  white: "#d6dae4",
  brightBlack: "#5a6274",
  brightRed: "#ff8fa3",
  brightGreen: "#6ff0b8",
  brightYellow: "#ffd88a",
  brightBlue: "#8cbcff",
  brightMagenta: "#dcb0ff",
  brightCyan: "#7ee6ee",
  brightWhite: "#f0f2f8",
};

export default function TerminalView({ serverId, active }: { serverId: string; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [phase, setPhase] = useState<"connecting" | "connected" | "error" | "closed">("connecting");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editPath, setEditPath] = useState<string | null>(null);
  const tabName = useTabs((s) => s.tabs.find((t) => t.serverId === serverId)?.name ?? serverId);

  useEffect(() => {
    const el = ref.current!;
    const term = new Terminal({
      theme: THEME,
      fontFamily: "'SF Mono', Menlo, 'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10000,
      cursorBlink: true,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.parser.registerOscHandler(7, (cwd) => {
      if (cwd.startsWith("/")) termCwd.set(serverId, cwd);
      return true;
    });
    term.parser.registerOscHandler(1337, (data) => {
      if (!data.startsWith(EDIT_PREFIX)) return false;
      setEditPath(data.slice(EDIT_PREFIX.length));
      return true;
    });

    // O hook é digitado quando a saída inicial (motd, prompt) fica 300ms quieta; o eco e a
    // saída dele ficam escondidos até o marcador. Se o usuário digitar antes, fica sem hook.
    // ponytail: prompt de 2+ linhas duplica a 1ª linha uma vez ao conectar
    let hook: "waiting" | "hiding" | "done" = "waiting";
    let hidden = ""; // binary string (atob), pra não quebrar UTF-8 no meio
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finishHook = (bin: string) => {
      hook = "done";
      clearTimeout(timer);
      term.write(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    };
    const sendHook = () => {
      hook = "hiding";
      api.sshWrite(serverId, b64encode(SHELL_HOOK + "\n")).catch(() => finishHook(hidden));
      // shell que não roda o hook (fish…) nunca imprime o marcador: mostra o que veio e segue
      timer = setTimeout(() => finishHook(hidden), 2000);
    };
    const onOutput = (payload: string) => {
      if (hook !== "hiding") {
        term.write(b64decode(payload));
        if (hook === "waiting") {
          clearTimeout(timer);
          timer = setTimeout(sendHook, 300);
        }
        return;
      }
      hidden += atob(payload);
      const i = hidden.indexOf(HOOK_READY);
      // limpa a linha do 1º prompt: o shell desenha outro logo depois do marcador
      if (i >= 0) finishHook("\r\x1b[2K" + hidden.slice(i + HOOK_READY.length));
    };

    term.onData((d) => {
      if (hook === "waiting") {
        hook = "done";
        clearTimeout(timer);
      }
      api.sshWrite(serverId, b64encode(d)).catch(() => {});
    });

    const unlisteners: UnlistenFn[] = [];
    let disposed = false;

    (async () => {
      unlisteners.push(
        await listen<string>(`ssh:stage:${serverId}`, (e) => setStage(e.payload)),
      );
      unlisteners.push(
        await listen<string>(`ssh:data:${serverId}`, (e) => onOutput(e.payload)),
      );
      unlisteners.push(
        await listen(`ssh:closed:${serverId}`, () => {
          useTabs.getState().setStatus(serverId, "closed");
          setPhase((p) => (p === "connected" ? "closed" : p));
        }),
      );
      if (disposed) return;
      // listeners prontos antes de conectar, pra não perder o banner
      try {
        await api.sshConnect(serverId, term.cols, term.rows);
        if (disposed) {
          // aba fechada enquanto conectava — não deixa sessão órfã
          api.sshDisconnect(serverId).catch(() => {});
          return;
        }
        setPhase("connected");
        useTabs.getState().setStatus(serverId, "connected");
        term.focus();
      } catch (err) {
        if (disposed) return;
        setError(String(err));
        setPhase("error");
        useTabs.getState().setStatus(serverId, "closed");
      }
    })();

    const ro = new ResizeObserver(() => {
      fit.fit();
      api.sshResize(serverId, term.cols, term.rows).catch(() => {});
    });
    ro.observe(el);

    return () => {
      disposed = true;
      clearTimeout(timer);
      termCwd.delete(serverId);
      ro.disconnect();
      unlisteners.forEach((u) => u());
      term.dispose();
    };
  }, [serverId, attempt]);

  useEffect(() => {
    if (active) {
      fitRef.current?.fit();
      termRef.current?.focus();
    }
  }, [active]);

  const retry = () => {
    setError(null);
    setStage(null);
    setPhase("connecting");
    useTabs.getState().setStatus(serverId, "connecting");
    setAttempt((a) => a + 1); // recria o terminal e reconecta
  };

  return (
    <div className="absolute inset-0">
      <div ref={ref} className="absolute inset-0 pl-2 pt-1" />
      {phase !== "connected" && (
        <ConnectingOverlay
          serverId={serverId}
          name={tabName}
          stage={stage}
          error={error}
          closed={phase === "closed"}
          onRetry={retry}
        />
      )}
      <FileEditor
        serverId={serverId}
        path={editPath}
        onClose={() => {
          setEditPath(null);
          termRef.current?.focus();
        }}
      />
    </div>
  );
}
