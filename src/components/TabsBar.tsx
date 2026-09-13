import { api } from "@/lib/api";
import { useTabs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Activity, FolderOpen, TerminalSquare, X } from "lucide-react";

const statusColor = {
  connecting: "bg-yellow-400 animate-pulse",
  connected: "bg-emerald-400",
  closed: "bg-zinc-500",
};

export default function TabsBar() {
  const { tabs, activeId, setActive, closeTab, setView } = useTabs();
  const active = tabs.find((t) => t.serverId === activeId);
  if (tabs.length === 0) return null;

  const close = (serverId: string) => {
    api.sshDisconnect(serverId).catch(() => {});
    closeTab(serverId);
  };

  return (
    <div className="flex items-center border-b border-border bg-sidebar shrink-0">
      <div className="flex-1 flex overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t.serverId}
            onClick={() => setActive(t.serverId)}
            onAuxClick={(e) => e.button === 1 && close(t.serverId)}
            className={cn(
              "group flex items-center gap-2 px-3 h-9 text-sm border-r border-border cursor-pointer select-none whitespace-nowrap",
              t.serverId === activeId
                ? "bg-[#0b0e14] text-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <span className={cn("size-1.5 rounded-full shrink-0", statusColor[t.status])} />
            {t.name}
            <button
              onClick={(e) => {
                e.stopPropagation();
                close(t.serverId);
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-foreground text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      {active && active.status === "connected" && (
        <div className="flex items-center gap-0.5 mx-1.5 p-0.5 rounded-md bg-muted/60 shrink-0">
          <button
            className={cn(
              "flex items-center gap-1.5 h-6 px-2 rounded text-xs transition-colors",
              active.view === "terminal"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView(active.serverId, "terminal")}
            title="Modo terminal"
          >
            <TerminalSquare className="size-3.5" />
            Terminal
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 h-6 px-2 rounded text-xs transition-colors",
              active.view === "gui"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView(active.serverId, "gui")}
            title="Modo arquivos (GUI)"
          >
            <FolderOpen className="size-3.5" />
            Arquivos
          </button>
          <button
            className={cn(
              "flex items-center gap-1.5 h-6 px-2 rounded text-xs transition-colors",
              active.view === "monitor"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setView(active.serverId, "monitor")}
            title="Monitor: KPIs, PM2 e ações rápidas"
          >
            <Activity className="size-3.5" />
            Monitor
          </button>
        </div>
      )}
    </div>
  );
}
