import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { api, b64decode, b64encode } from "@/lib/api";
import { useTabs } from "@/lib/store";
import ConnectingOverlay from "@/components/ConnectingOverlay";

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

    term.onData((d) => api.sshWrite(serverId, b64encode(d)).catch(() => {}));

    const unlisteners: UnlistenFn[] = [];
    let disposed = false;

    (async () => {
      unlisteners.push(
        await listen<string>(`ssh:stage:${serverId}`, (e) => setStage(e.payload)),
      );
      unlisteners.push(
        await listen<string>(`ssh:data:${serverId}`, (e) => term.write(b64decode(e.payload))),
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
    </div>
  );
}
