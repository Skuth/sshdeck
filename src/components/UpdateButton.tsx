import { useCallback, useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes } from "@/lib/api";
import Changelog from "@/components/Changelog";
import ChangelogDialog from "@/components/ChangelogDialog";
import { ArrowUpCircle, Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";

const POLL_MS = 5 * 60 * 1000;

/** Rodapé da sidebar: CTA de update, versão + changelog e verificação manual. */
export default function UpdateButton() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checking, setChecking] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const doCheck = useCallback(async (manual: boolean) => {
    setChecking(true);
    try {
      const u = await check();
      if (u) {
        setUpdate(u);
        if (manual) toast.success(`Versão v${u.version} disponível!`);
      } else if (manual) {
        toast.success("Você já está na versão mais recente");
      }
    } catch (e) {
      // em dev não existe latest.json/assinatura — só reporta se foi manual
      if (manual) toast.error(`Falha ao verificar atualizações: ${e}`);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    doCheck(false);
    const id = setInterval(() => doCheck(false), POLL_MS);
    return () => clearInterval(id);
  }, [doCheck]);

  const install = async () => {
    if (!update) return;
    let total = 0;
    let done = 0;
    setProgress({ done: 0, total: 0 });
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          total = ev.data.contentLength ?? 0;
          setProgress({ done: 0, total });
        } else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          setProgress({ done, total });
        }
      });
      setInstalled(true);
    } catch (e) {
      setProgress(null);
      toast.error(`Falha ao atualizar: ${e}`);
    }
  };

  return (
    <>
      {update && (
        <div className="p-2 border-t border-border">
          <Button className="w-full h-8 text-xs" onClick={() => setOpen(true)}>
            <ArrowUpCircle className="size-4" />
            Atualizar para v{update.version}
          </Button>
        </div>
      )}

      <div className="flex items-center border-t border-border">
        <button
          className="flex-1 text-[10px] text-muted-foreground/70 hover:text-foreground py-1.5 transition-colors truncate"
          onClick={() => setChangelogOpen(true)}
          title="Ver changelog completo"
        >
          SSHDeck {version && `v${version}`} — changelog
        </button>
        <button
          className="px-2 py-1.5 text-muted-foreground/70 hover:text-foreground transition-colors"
          title="Verificar atualizações agora"
          disabled={checking}
          onClick={() => doCheck(true)}
        >
          {checking ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
        </button>
      </div>

      <ChangelogDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />

      {update && (
        <Dialog open={open} onOpenChange={(o) => !progress && setOpen(o)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowUpCircle className="size-5 text-primary" />
                Nova versão disponível
              </DialogTitle>
              <DialogDescription>
                v{update.currentVersion} →{" "}
                <span className="text-primary font-medium">v{update.version}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background/50 p-4">
              <Changelog md={update.body ?? "Sem notas para esta versão."} />
            </div>

            {progress && !installed && (
              <div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: progress.total
                        ? `${Math.min(100, (progress.done / progress.total) * 100)}%`
                        : "40%",
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Baixando… {formatBytes(progress.done)}
                  {progress.total > 0 && ` / ${formatBytes(progress.total)}`}
                </p>
              </div>
            )}

            <DialogFooter>
              {installed ? (
                <Button onClick={() => relaunch()}>
                  <RotateCcw className="size-4" />
                  Reiniciar agora
                </Button>
              ) : (
                <>
                  <Button variant="ghost" disabled={!!progress} onClick={() => setOpen(false)}>
                    Depois
                  </Button>
                  <Button disabled={!!progress} onClick={install}>
                    <Download className="size-4" />
                    Baixar e instalar
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
