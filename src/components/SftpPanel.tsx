import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { api, b64encode, formatBytes, SftpEntry, SftpProgress } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ConfirmDialog from "@/components/ConfirmDialog";
import FileEditor from "@/components/FileEditor";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowUp,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  PencilLine,
  RefreshCw,
  SquarePen,
  Terminal,
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

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext))
    return { Icon: FileImage, color: "#c795f0" };
  if (["zip", "tar", "gz", "tgz", "bz2", "xz", "rar", "7z"].includes(ext))
    return { Icon: FileArchive, color: "#e8c26e" };
  if (
    name.startsWith(".env") ||
    ["js", "ts", "tsx", "jsx", "json", "yml", "yaml", "toml", "sh", "bash", "rs", "py", "php", "rb", "go", "sql", "html", "css", "vue"].includes(ext)
  )
    return { Icon: FileCode2, color: "#6ea8f7" };
  if (["md", "txt", "log", "conf", "ini"].includes(ext)) return { Icon: FileText, color: "#8a93a8" };
  return { Icon: File, color: "#8a93a8" };
}

export default function SftpPanel({ serverId, full = false }: { serverId: string; full?: boolean }) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<SftpProgress | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SftpEntry | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [renameTarget, setRenameTarget] = useState<SftpEntry | null>(null);
  const [renameName, setRenameName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editPath, setEditPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">(full ? "grid" : "list");

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

  /** Abre o arquivo no editor do terminal da sessão: nano, ou vim se não tiver. */
  const editInTerminal = (entry: SftpEntry) => {
    const esc = entry.path.replace(/'/g, `'\\''`);
    const cmd = `command -v nano >/dev/null 2>&1 && nano -- '${esc}' || vim -- '${esc}'\n`;
    api.sshWrite(serverId, b64encode(cmd))
      .then(() => toast.info(`Abrindo ${entry.name} no editor do terminal…`))
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

  const rename = () => {
    const entry = renameTarget;
    const name = renameName.trim();
    setRenameTarget(null);
    if (!entry || !name || name === entry.name) return;
    api.sftpRename(serverId, entry.path, join(parent(entry.path), name))
      .then(refresh)
      .catch((e) => toast.error(String(e)));
  };

  const openEntry = (e: SftpEntry) => (e.isDir ? setPath(e.path) : setEditPath(e.path));

  const entryMenu = (e: SftpEntry) => (
    <ContextMenuContent>
      <ContextMenuItem onClick={() => openEntry(e)}>
        {e.isDir ? <FolderOpen className="size-4" /> : <SquarePen className="size-4" />}
        {e.isDir ? "Abrir pasta" : "Abrir no editor"}
      </ContextMenuItem>
      {!e.isDir && (
        <ContextMenuItem onClick={() => editInTerminal(e)}>
          <Terminal className="size-4" /> Editar no terminal (nano)
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={() => download(e)}>
        <Download className="size-4" /> {e.isDir ? "Baixar pasta completa" : "Baixar"}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          setRenameName(e.name);
          setRenameTarget(e);
        }}
      >
        <PencilLine className="size-4" /> Renomear
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => setDeleteTarget(e)}>
        <Trash2 className="size-4" /> Excluir
      </ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <aside
      className={
        full
          ? "w-full h-full flex flex-col bg-[#0e1118]"
          : "w-90 shrink-0 flex flex-col bg-sidebar border-l border-border"
      }
    >
      <div className="flex items-center gap-1 px-2 h-9 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
          Arquivos
        </span>
        <div className="ml-auto flex gap-0.5 items-center">
          <div className="flex items-center rounded-md bg-muted/60 p-0.5 mr-1">
            <button
              className={cn(
                "h-5.5 px-1.5 rounded flex items-center",
                viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              title="Lista"
              onClick={() => setViewMode("list")}
            >
              <List className="size-3.5" />
            </button>
            <button
              className={cn(
                "h-5.5 px-1.5 rounded flex items-center",
                viewMode === "grid" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
              title="Ícones grandes"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
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

      <div className="flex items-center gap-1.5 p-2 border-b border-border shrink-0">
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
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/8 shrink-0">
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
        <div className="px-3 py-2 border-b border-border shrink-0">
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

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex-1 overflow-y-auto p-1">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1 p-1.5">
                {entries?.map((e) => {
                  const { Icon, color } = e.isDir
                    ? { Icon: Folder, color: "#57d9a3" }
                    : fileIcon(e.name);
                  return (
                    <ContextMenu key={e.path}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={cn(
                            "group relative flex flex-col items-center gap-1.5 rounded-lg px-2 pt-5 pb-2 cursor-pointer border border-transparent hover:bg-accent/50 hover:border-border",
                            selected.has(e.path) && "bg-primary/10 border-primary/30",
                          )}
                          onClick={() => openEntry(e)}
                          onDoubleClick={() => !e.isDir && download(e)}
                          onContextMenu={(ev) => ev.stopPropagation()}
                          title={e.isDir ? e.name : `${e.name} — click abre no editor, duplo click baixa`}
                        >
                          <span
                            className={cn(
                              "absolute top-1.5 left-1.5",
                              selected.size > 0 || selected.has(e.path)
                                ? "flex"
                                : "hidden group-hover:flex",
                            )}
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <Checkbox
                              checked={selected.has(e.path)}
                              onCheckedChange={() => toggleSelect(e.path)}
                            />
                          </span>
                          <Icon className="size-11" strokeWidth={1.25} style={{ color }} />
                          <span className="text-[11px] text-center leading-tight break-all line-clamp-2 w-full">
                            {e.name}
                          </span>
                          {!e.isDir && (
                            <span className="text-[9px] text-muted-foreground -mt-1">
                              {formatBytes(e.size)}
                            </span>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      {entryMenu(e)}
                    </ContextMenu>
                  );
                })}
              </div>
            ) : (
              entries?.map((e) => {
                const { Icon, color } = e.isDir
                  ? { Icon: Folder, color: "#57d9a3" }
                  : fileIcon(e.name);
                return (
                  <ContextMenu key={e.path}>
                    <ContextMenuTrigger asChild>
                      <div
                        className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/60 cursor-pointer"
                        onClick={() => openEntry(e)}
                        onDoubleClick={() => !e.isDir && download(e)}
                        onContextMenu={(ev) => ev.stopPropagation()}
                        title={e.isDir ? e.name : `${e.name} — click abre no editor, duplo click baixa`}
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
                        <Icon className="size-4 shrink-0" style={{ color }} />
                        <span className="text-sm truncate flex-1">{e.name}</span>
                        {!e.isDir && (
                          <span className="text-[10px] text-muted-foreground group-hover:hidden">
                            {formatBytes(e.size)}
                          </span>
                        )}
                        <div className="hidden group-hover:flex gap-1">
                          {!e.isDir && (
                            <button
                              className="text-muted-foreground hover:text-primary"
                              title="Editar no terminal (nano/vim)"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                editInTerminal(e);
                              }}
                            >
                              <SquarePen className="size-4" />
                            </button>
                          )}
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
                    </ContextMenuTrigger>
                    {entryMenu(e)}
                  </ContextMenu>
                );
              })
            )}
            {entries && entries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-6">
                Pasta vazia — click direito pra criar uma pasta ou enviar arquivo
              </p>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setMkdirOpen(true)}>
            <FolderPlus className="size-4" /> Nova pasta
          </ContextMenuItem>
          <ContextMenuItem onClick={upload}>
            <Upload className="size-4" /> Enviar arquivo
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => refetch()}>
            <RefreshCw className="size-4" /> Atualizar
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <FileEditor
        serverId={serverId}
        path={editPath}
        onClose={() => {
          setEditPath(null);
          refresh();
        }}
      />

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

      <Dialog open={renameTarget !== null} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Renomear</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && rename()}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={rename} disabled={!renameName.trim()}>
              Renomear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
