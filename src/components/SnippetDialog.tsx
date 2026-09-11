import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, Snippet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmDialog, { undoToast } from "@/components/ConfirmDialog";

export default function SnippetDialog({
  snippet,
  onClose,
}: {
  snippet: Snippet | "new" | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Snippet>({ id: "", name: "", command: "" });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (snippet === "new") setForm({ id: crypto.randomUUID(), name: "", command: "" });
    else if (snippet) setForm({ ...snippet });
  }, [snippet]);

  const save = async () => {
    if (!form.name || !form.command) {
      toast.error("Nome e comando são obrigatórios");
      return;
    }
    await api.saveSnippet(form);
    queryClient.invalidateQueries({ queryKey: ["vault"] });
    onClose();
  };

  return (
    <Dialog open={snippet !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{snippet === "new" ? "Novo snippet" : "Editar snippet"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input
              placeholder="Reiniciar nginx"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Comando</Label>
            <Textarea
              className="font-mono text-xs"
              placeholder="sudo systemctl restart nginx"
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {snippet !== "new" && snippet !== null ? (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir snippet?"
        description={`O snippet "${form.name}" será removido.`}
        onConfirm={async () => {
          const sn = { ...form };
          setConfirmDelete(false);
          await api.deleteSnippet(sn.id);
          queryClient.invalidateQueries({ queryKey: ["vault"] });
          onClose();
          undoToast(`Snippet "${sn.name}" excluído`, async () => {
            await api.saveSnippet(sn);
            queryClient.invalidateQueries({ queryKey: ["vault"] });
          });
        }}
      />
    </Dialog>
  );
}
