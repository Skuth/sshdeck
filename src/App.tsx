import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, VaultStatus } from "@/lib/api";
import { useTabs } from "@/lib/store";
import UnlockScreen from "@/components/UnlockScreen";
import Sidebar from "@/components/Sidebar";
import TabsBar from "@/components/TabsBar";
import TerminalView from "@/components/TerminalView";
import SftpPanel from "@/components/SftpPanel";
import MonitorPanel from "@/components/MonitorPanel";
import { TerminalSquare } from "lucide-react";

export default function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const { tabs, activeId } = useTabs();
  const queryClient = useQueryClient();

  useEffect(() => {
    api.vaultStatus().then(setStatus);
  }, []);

  if (status === null) return null;

  if (status !== "unlocked") {
    return (
      <UnlockScreen
        mode={status === "missing" ? "create" : "unlock"}
        onUnlocked={() => {
          queryClient.invalidateQueries();
          setStatus("unlocked");
        }}
      />
    );
  }

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar
        onLock={async () => {
          for (const t of tabs) await api.sshDisconnect(t.serverId).catch(() => {});
          useTabs.setState({ tabs: [], activeId: null });
          await api.vaultLock();
          queryClient.clear();
          setStatus("locked");
        }}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <TabsBar />
        <div className="flex-1 relative bg-[#0b0e14]">
          {tabs.map((t) => (
            <div
              key={t.serverId}
              className={
                t.serverId === activeId
                  ? "absolute inset-0"
                  : "absolute inset-0 invisible pointer-events-none"
              }
            >
              <TerminalView
                serverId={t.serverId}
                active={t.serverId === activeId && t.view === "terminal"}
              />
              {t.view === "gui" && t.status === "connected" && (
                <div className="absolute inset-0 z-10 bg-background">
                  <SftpPanel serverId={t.serverId} full />
                </div>
              )}
              {t.view === "monitor" && t.status === "connected" && (
                <div className="absolute inset-0 z-10 bg-background">
                  <MonitorPanel serverId={t.serverId} />
                </div>
              )}
            </div>
          ))}
          {tabs.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground select-none">
              <TerminalSquare className="size-12 opacity-30" />
              <p className="text-sm">Clique em um servidor na lateral para conectar</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
