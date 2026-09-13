import { useEffect, useState } from "react";
import RSCEditor from "react-simple-code-editor";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { detectLang, highlightCode } from "@/lib/highlight";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { FileCode2, Loader2, Save } from "lucide-react";

// interop CJS/ESM: dependendo do bundling o default vem aninhado
const Editor = ((RSCEditor as unknown as { default?: typeof RSCEditor }).default ??
  RSCEditor) as typeof RSCEditor;

/** Editor de texto embutido: abre arquivo remoto via SFTP e salva de volta. */
export default function FileEditor({
  serverId,
  path,
  onClose,
}: {
  serverId: string;
  path: string | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirty = content !== original;
  const name = path?.split("/").pop() ?? "";
  const lang = detectLang(name);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    setContent("");
    setOriginal("");
    api
      .sftpReadText(serverId, path)
      .then((text) => {
        setContent(text);
        setOriginal(text);
      })
      .catch((e) => {
        toast.error(String(e));
        onClose();
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, path]);

  const save = async () => {
    if (!path || !dirty || saving) return;
    setSaving(true);
    try {
      await api.sftpWriteText(serverId, path, content);
      setOriginal(content);
      toast.success(`${name} salvo no servidor`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const tryClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <Dialog open={path !== null} onOpenChange={(o) => !o && tryClose()}>
      <DialogContent
        className="sm:max-w-4xl h-[85vh] flex flex-col gap-3"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          tryClose();
        }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <FileCode2 className="size-4 text-primary shrink-0" />
            <span className="truncate">{name}</span>
            {lang && (
              <span className="text-[9px] uppercase tracking-wider bg-muted rounded px-1.5 py-px text-muted-foreground shrink-0">
                {lang}
              </span>
            )}
            {dirty && <span className="size-2 rounded-full bg-yellow-400 shrink-0" title="Alterações não salvas" />}
          </DialogTitle>
          <DialogDescription className="font-mono text-[11px] truncate">{path}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" /> Carregando arquivo…
          </div>
        ) : (
          <div
            className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-[#0b0e14] focus-within:ring-2 focus-within:ring-ring/40"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                save();
              }
            }}
          >
            <Editor
              value={content}
              onValueChange={setContent}
              highlight={(code) => highlightCode(code, lang)}
              padding={12}
              textareaClassName="outline-none"
              className="font-mono text-xs leading-relaxed min-h-full [&_textarea]:outline-none"
              style={{ minHeight: "100%" }}
            />
          </div>
        )}

        <div className="flex items-center justify-between shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {dirty ? "Alterações não salvas — ⌘S salva" : "Tudo salvo"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={tryClose}>
              Fechar
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving || loading}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar no servidor
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          title="Descartar alterações?"
          description={`"${name}" tem alterações não salvas. Fechar sem salvar?`}
          confirmLabel="Descartar"
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
