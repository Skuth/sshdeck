import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { api, formatBytes, SftpEntry, SftpProgress } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowUp,
  Download,
  File,
  Folder,
  FolderPlus,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

function parent(path: string): string {
  const p = path.replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

const join = (dir: string, name: string) => (dir === "/" ? `/${name}` : `${dir}/${name}`);

export default function SftpPanel({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<SftpProgress | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SftpEntry | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setSelected(new Set()), [path]);

  const toggleSelect = (p: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  useEffect(() => {
    api.sftpHome(serverId).then(setPath).catch((e) => toast.error(String(e)));
  }, [serverId]);

  useEffect(() => {
    const un = listen<SftpProgress>("sftp:progress", (e) => {
      if (e.payload.serverId !== serverId) return;
      setProgress(e.payload.done ? null : e.payload);
      if (e.payload.done) toast.success(`Transferência concluída: ${e.payload.file.split("/").pop()}`);
    });
    return () => {
      un.then((f) => f());
    };
  }, [serverId]);

  const { data: entries, isFetching, refetch } = useQuery({
    queryKey: ["sftp", serverId, path],
    queryFn: () => api.sftpList(serverId, path!),
    enabled: path !== null,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sftp", serverId, path] });

  const download = async (entry: SftpEntry) => {
    if (entry.isDir) {
      const dest = await openFile({ directory: true, multiple: false });
      if (typeof dest !== "string") return;
      toast.info(`Baixando pasta ${entry.name}…`);
      api.sftpDownloadDir(serverId, entry.path, `${dest}/${entry.name}`)
        .then((skipped) => {
          if (skipped > 0) toast.warning(`${skipped} item(ns) pulado(s) (sem permissão ou link quebrado)`);
        })
        .catch((e) => toast.error(String(e)));
      return;
    }
    const dest = await saveFile({ defaultPath: entry.name });
    if (!dest) return;
    toast.info(`Baixando ${entry.name}…`);
    api.sftpDownload(serverId, entry.path, dest).catch((e) => toast.error(String(e)));
  };

  const downloadSelected = async () => {
    const items = (entries ?? []).filter((e) => selected.has(e.path));
    if (!items.length) return;
    const dest = await openFile({ directory: true, multiple: false });
    if (typeof dest !== "string") return;
    setSelected(new Set());
    toast.info(`Baixando ${items.length} item(ns)…`);
    for (const e of items) {
      try {
        if (e.isDir) await api.sftpDownloadDir(serverId, e.path, `${dest}/${e.name}`);
        else await api.sftpDownload(serverId, e.path, `${dest}/${e.name}`);
      } catch (err) {
        toast.error(`${e.name}: ${err}`);
      }
    }
    toast.success(`Download concluído em ${dest}`);
  };

  const upload = async () => {
    const src = await openFile({ multiple: false });
    if (typeof src !== "string" || !path) return;
    const name = src.split("/").pop()!;
    toast.info(`Enviando ${name}…`);
    api.sftpUpload(serverId, src, join(path, name))
      .then(refresh)
      .catch((e) => toast.error(String(e)));
  };

  const mkdir = () => {
    const name = mkdirName.trim();
    setMkdirOpen(false);
    setMkdirName("");
    if (!name || !path) return;
    api.sftpMkdir(serverId, join(path, name))
      .then(refresh)
      .catch((e) => toast.error(String(e)));
  };

  return (
    <aside className="w-90 shrink-0 flex flex-col bg-sidebar border-l border-border">
      <div className="flex items-center gap-1 px-2 h-9 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
          Arquivos
        </span>
        <div className="ml-auto flex gap-0.5">
          <Button variant="ghost" size="icon-sm" title="Enviar arquivo" onClick={upload}>
            <Upload className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Nova pasta" onClick={() => setMkdirOpen(true)}>
            <FolderPlus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Atualizar" onClick={() => refetch()}>
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 p-2 border-b border-border">
        <Button
          variant="secondary"
          size="icon-sm"
          disabled={!path || path === "/"}
          onClick={() => path && setPath(parent(path))}
          title="Subir um nível"
        >
          <ArrowUp className="size-4" />
        </Button>
        <Input
          className="h-7 text-xs font-mono"
          value={path ?? ""}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refresh()}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/8">
          <span className="text-xs text-muted-foreground flex-1">
            {selected.size} selecionado(s)
          </span>
          <Button size="sm" className="h-7 text-xs" onClick={downloadSelected}>
            <Download className="size-3.5" /> Baixar
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Limpar seleção"
            onClick={() => setSelected(new Set())}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {progress && (
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs truncate mb-1">{progress.file.split("/").pop()}</p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: progress.total
                  ? `${Math.min(100, (progress.transferred / progress.total) * 100)}%`
                  : "50%",
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatBytes(progress.transferred)}
            {progress.total > 0 && ` / ${formatBytes(progress.total)}`}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {entries?.map((e) => (
          <div
            key={e.path}
            className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/60 cursor-pointer"
            onClick={() => e.isDir && setPath(e.path)}
            onDoubleClick={() => !e.isDir && download(e)}
            title={e.isDir ? e.name : `${e.name} — duplo click para baixar`}
          >
            <span
              className={
                selected.size > 0 || selected.has(e.path)
                  ? "flex"
                  : "hidden group-hover:flex"
              }
              onClick={(ev) => ev.stopPropagation()}
            >
              <Checkbox
                checked={selected.has(e.path)}
                onCheckedChange={() => toggleSelect(e.path)}
              />
            </span>
            {e.isDir ? (
              <Folder className="size-4 text-primary/80 shrink-0" />
            ) : (
              <File className="size-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm truncate flex-1">{e.name}</span>
            {!e.isDir && (
              <span className="text-[10px] text-muted-foreground group-hover:hidden">
                {formatBytes(e.size)}
              </span>
            )}
            <div className="hidden group-hover:flex gap-1">
              <button
                className="text-muted-foreground hover:text-primary"
                title={e.isDir ? "Baixar pasta completa" : "Baixar"}
                onClick={(ev) => {
                  ev.stopPropagation();
                  download(e);
                }}
              >
                <Download className="size-4" />
              </button>
              <button
                className="text-muted-foreground hover:text-destructive"
                title="Excluir"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setDeleteTarget(e);
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {entries && entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-6">Pasta vazia</p>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget?.isDir ? "Excluir pasta do servidor?" : "Excluir arquivo do servidor?"}
        description={`"${deleteTarget?.name}" será excluído PERMANENTEMENTE do servidor remoto. Essa ação não tem desfazer.`}
        confirmLabel="Excluir do servidor"
        onConfirm={() => {
          const entry = deleteTarget!;
          setDeleteTarget(null);
          api.sftpRemove(serverId, entry.path, entry.isDir)
            .then(refresh)
            .catch((e) => toast.error(String(e)));
        }}
      />

      <Dialog open={mkdirOpen} onOpenChange={(o) => !o && setMkdirOpen(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="nome-da-pasta"
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mkdir()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMkdirOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={mkdir} disabled={!mkdirName.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
