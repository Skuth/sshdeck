import { api } from "@/lib/api";
import { useTabs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FolderOpen, X } from "lucide-react";

const statusColor = {
  connecting: "bg-yellow-400 animate-pulse",
  connected: "bg-emerald-400",
  closed: "bg-zinc-500",
};

export default function TabsBar() {
  const { tabs, activeId, setActive, closeTab, sftpOpen, toggleSftp } = useTabs();
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
      <Button
        variant={sftpOpen ? "secondary" : "ghost"}
        size="sm"
        className="mx-1 h-7 text-xs"
        onClick={toggleSftp}
        title="Arquivos (SFTP)"
      >
        <FolderOpen className="size-3.5" />
        SFTP
      </Button>
    </div>
  );
}
