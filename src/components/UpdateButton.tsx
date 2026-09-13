import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
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
import { ArrowUpCircle, Download, RotateCcw } from "lucide-react";

export default function UpdateButton() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // em dev não existe latest.json/assinatura — ignora silenciosamente
    check()
      .then((u) => u && setUpdate(u))
      .catch(() => {});
  }, []);

  if (!update) return null;

  const install = async () => {
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
      <div className="p-2 border-t border-border">
        <Button className="w-full h-8 text-xs" onClick={() => setOpen(true)}>
          <ArrowUpCircle className="size-4" />
          Atualizar para v{update.version}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !progress && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="size-5 text-primary" />
              Nova versão disponível
            </DialogTitle>
            <DialogDescription>
              v{update.currentVersion} → <span className="text-primary font-medium">v{update.version}</span>
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
    </>
  );
}
