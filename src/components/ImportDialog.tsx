import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@/lib/readTextFile";
import { parseServers } from "@/lib/importParse";
import { toast } from "sonner";
import { api, Server } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUp } from "lucide-react";

export default function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const { parsed, error } = useMemo(() => {
    try {
      return { parsed: parseServers(text, () => crypto.randomUUID()), error: null as string | null };
    } catch (e) {
      return { parsed: [] as Server[], error: String(e) };
    }
  }, [text]);

  const doImport = async () => {
    try {
      const n = await api.importServers(parsed);
      queryClient.invalidateQueries({ queryKey: ["vault"] });
      toast.success(`${n} servidor(es) importado(s)`);
      setText("");
      onClose();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar servidores</DialogTitle>
          <DialogDescription>
            Cole CSV (cabeçalho: name,host,port,username,password,tags) ou JSON (array com os
            mesmos campos). Tags separadas por “;”. Servidores com mesmo host/porta/usuário são
            atualizados, não duplicados.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          className="min-h-40 font-mono text-xs"
          placeholder={`name,host,port,username,password,tags\nAPI Prod,10.0.0.5,22,root,s3nh4,produção;aws`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const f = await openFile({
                multiple: false,
                filters: [{ name: "CSV/JSON", extensions: ["csv", "json", "txt"] }],
              });
              if (typeof f === "string") setText(await readTextFile(f));
            }}
          >
            <FileUp className="size-4" /> Escolher arquivo…
          </Button>
          {error ? (
            <span className="text-destructive text-xs">Formato inválido</span>
          ) : (
            <span className="text-muted-foreground text-xs">
              {parsed.length} servidor(es) reconhecido(s)
            </span>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={doImport} disabled={parsed.length === 0}>
            Importar {parsed.length > 0 && `(${parsed.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
