import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { TAG_PALETTE } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import ConfirmDialog, { undoToast } from "@/components/ConfirmDialog";

export default function TagDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["vault"], queryFn: api.getVault });
  const [newTag, setNewTag] = useState("");
  const [newColor, setNewColor] = useState(TAG_PALETTE[0]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const tagColors = data?.tagColors ?? {};
  const usage = (tag: string) =>
    (data?.servers ?? []).filter((s) => s.tags.includes(tag)).length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vault"] });

  const create = async () => {
    const name = newTag.trim().toLowerCase();
    if (!name) return;
    if (tagColors[name]) {
      toast.error("Essa tag já existe");
      return;
    }
    await api.setTagColor(name, newColor);
    setNewTag("");
    invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>
            Crie categorias, escolha as cores e organize seus servidores. Tag nova criada num
            servidor ganha uma cor padrão automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 items-center">
          <Input
            placeholder="nova tag…"
            className="h-8"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <div className="flex gap-1 shrink-0">
            {TAG_PALETTE.map((c) => (
              <button
                key={c}
                className={cn(
                  "size-4 rounded-full border-2",
                  c === newColor ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <Button size="icon-sm" variant="secondary" onClick={create} disabled={!newTag.trim()}>
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="grid gap-1 max-h-72 overflow-y-auto">
          {Object.keys(tagColors)
            .sort()
            .map((tag) => (
              <div key={tag} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
                <span className="text-sm flex-1 truncate" style={{ color: tagColors[tag] }}>
                  {tag}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{usage(tag)}</span>
                <div className="flex gap-1 shrink-0">
                  {TAG_PALETTE.map((c) => (
                    <button
                      key={c}
                      className={cn(
                        "size-3.5 rounded-full border-2",
                        c === tagColors[tag] ? "border-foreground" : "border-transparent",
                      )}
                      style={{ backgroundColor: c }}
                      onClick={async () => {
                        await api.setTagColor(tag, c);
                        invalidate();
                      }}
                    />
                  ))}
                </div>
                <button
                  className="text-muted-foreground hover:text-destructive ml-1"
                  title="Excluir tag (remove de todos os servidores)"
                  onClick={() => setDeleteTarget(tag)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          {Object.keys(tagColors).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tag ainda.</p>
          )}
        </div>
      </DialogContent>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Excluir tag?"
        description={`A tag "${deleteTarget}" será removida de todos os servidores que a usam.`}
        onConfirm={async () => {
          const tag = deleteTarget!;
          setDeleteTarget(null);
          // guarda o necessário pra desfazer: cor + servidores afetados
          const color = tagColors[tag];
          const affected = (data?.servers ?? []).filter((s) => s.tags.includes(tag));
          await api.deleteTag(tag);
          invalidate();
          undoToast(`Tag "${tag}" excluída`, async () => {
            await api.setTagColor(tag, color);
            for (const s of affected) await api.saveServer(s);
            invalidate();
          });
        }}
      />
    </Dialog>
  );
}
