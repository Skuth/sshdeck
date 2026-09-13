import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { save as saveFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { FileDown, ShieldAlert } from "lucide-react";

export default function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["vault"], queryFn: api.getVault });
  const [withSecrets, setWithSecrets] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setWithSecrets(false);
      setPassword("");
    }
  }, [open]);

  const servers = data?.servers ?? [];

  const doExport = async () => {
    setBusy(true);
    try {
      if (withSecrets && !(await api.verifyMasterPassword(password))) {
        toast.error("Senha-mestre incorreta");
        return;
      }
      const out = servers.map((s) => ({
        name: s.name,
        host: s.host,
        port: s.port,
        username: s.username,
        authType: s.authType,
        keyPath: s.keyPath ?? undefined,
        tags: s.tags,
        forwards: s.forwards,
        ...(withSecrets
          ? { password: s.password ?? undefined, keyPassphrase: s.keyPassphrase ?? undefined }
          : {}),
      }));
      const dest = await saveFile({
        defaultPath: withSecrets ? "sshdeck-servers-com-senhas.json" : "sshdeck-servers.json",
      });
      if (!dest) return;
      await api.writeTextFile(dest, JSON.stringify(out, null, 2) + "\n");
      toast.success(`${out.length} servidor(es) exportado(s)`);
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar servidores</DialogTitle>
          <DialogDescription>
            Gera um JSON com {servers.length} servidor(es), no mesmo formato aceito pela
            importação. Por padrão as senhas ficam de fora.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/40">
          <Checkbox
            checked={withSecrets}
            onCheckedChange={(v) => setWithSecrets(v === true)}
            className="mt-0.5"
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Incluir senhas e passphrases</span>
            <span className="text-xs text-muted-foreground">
              Exige confirmar a senha-mestre do vault.
            </span>
          </span>
        </label>

        {withSecrets && (
          <div className="grid gap-2">
            <div className="flex items-start gap-2 text-xs text-yellow-500/90 bg-yellow-500/10 border border-yellow-500/25 rounded-md p-2.5">
              <ShieldAlert className="size-4 shrink-0 mt-px" />
              <span>
                O arquivo exportado fica em <strong>texto plano</strong>, sem criptografia. Guarde
                com cuidado e apague depois de usar.
              </span>
            </div>
            <Label htmlFor="export-pw">Senha-mestre</Label>
            <Input
              id="export-pw"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && password && doExport()}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={doExport}
            disabled={busy || servers.length === 0 || (withSecrets && !password)}
          >
            <FileDown className="size-4" />
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
