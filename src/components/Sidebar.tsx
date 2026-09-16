import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { api, b64encode, Server, Snippet } from "@/lib/api";
import { TAG_PALETTE } from "@/lib/tags";
import { useTabs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ServerDialog from "@/components/ServerDialog";
import ImportDialog from "@/components/ImportDialog";
import SnippetDialog from "@/components/SnippetDialog";
import TagDialog from "@/components/TagDialog";
import ConfirmDialog, { undoToast } from "@/components/ConfirmDialog";
import Truncated from "@/components/Truncated";
import UpdateButton from "@/components/UpdateButton";
import ExportDialog from "@/components/ExportDialog";
import {
  ArrowLeftRight,
  ChevronDown,
  FileDown,
  Import,
  Lock,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Server as ServerIcon,
  Tag as TagIcon,
  TerminalSquare,
  Trash2,
} from "lucide-react";

const NO_TAG = " sem-tag";

interface Group {
  tag: string | null;
  servers: Server[];
}

/** Agrupa pela primeira tag, na ordem em que aparecem no vault. */
function buildGroups(servers: Server[]): Group[] {
  const map = new Map<string, Group>();
  for (const s of servers) {
    const key = s.tags[0] ?? NO_TAG;
    if (!map.has(key)) map.set(key, { tag: s.tags[0] ?? null, servers: [] });
    map.get(key)!.servers.push(s);
  }
  // sem categoria sempre por último
  const groups = [...map.values()];
  const i = groups.findIndex((g) => g.tag === null);
  if (i >= 0) groups.push(...groups.splice(i, 1));
  return groups;
}

function retag(tags: string[], target: string | null): string[] {
  const rest = tags.slice(1).filter((t) => t !== target);
  return target === null ? rest : [target, ...rest];
}

export default function Sidebar({ onLock }: { onLock: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["vault"], queryFn: api.getVault });
  const { data: activeForwards } = useQuery({ queryKey: ["forwards"], queryFn: api.forwardList });
  const { tabs, activeId, openTab } = useTabs();

  const [search, setSearch] = useState("");
  const [editServer, setEditServer] = useState<Server | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [editSnippet, setEditSnippet] = useState<Snippet | "new" | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    const un = listen("forward:stopped", () =>
      queryClient.invalidateQueries({ queryKey: ["forwards"] }),
    );
    return () => {
      un.then((f) => f());
    };
  }, [queryClient]);

  const servers = data?.servers ?? [];
  const snippets = data?.snippets ?? [];
  const tagColors = data?.tagColors ?? {};
  const colorOf = (tag: string | null) => (tag && tagColors[tag]) || "#8a93a8";

  const q = search.toLowerCase();
  const visible = servers.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.host.toLowerCase().includes(q) ||
      s.username.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  );

  const groups = useMemo(() => {
    const gs = buildGroups(visible);
    if (q) return gs;
    // categorias do registro sem servidor aparecem vazias (dá pra arrastar pra dentro)
    const known = new Set(gs.map((g) => g.tag));
    const empty: Group[] = Object.keys(tagColors)
      .filter((t) => !known.has(t))
      .sort()
      .map((t) => ({ tag: t, servers: [] }));
    const noTagIdx = gs.findIndex((g) => g.tag === null);
    return noTagIdx >= 0
      ? [...gs.slice(0, noTagIdx), ...empty, ...gs.slice(noTagIdx)]
      : [...gs, ...empty];
  }, [visible, q, tagColors]);

  const canDrag = !q; // com busca ativa a ordem exibida não é a real

  const connect = (s: Server) => {
    openTab(s.id, s.name); // se já existe, só foca — nunca duplica
  };

  /** Move o servidor arrastado pra dentro de `targetTag`, na posição `index` do grupo. */
  const moveServer = async (targetTag: string | null, index: number) => {
    const id = dragId.current;
    dragId.current = null;
    setDropTarget(null);
    if (!id) return;
    const dragged = servers.find((s) => s.id === id);
    if (!dragged) return;

    const gs: Group[] = buildGroups(servers).map((g) => ({
      ...g,
      servers: g.servers.filter((s) => s.id !== id),
    }));
    let target = gs.find((g) => g.tag === targetTag);
    if (!target) {
      target = { tag: targetTag, servers: [] };
      gs.push(target);
    }
    target.servers.splice(Math.min(index, target.servers.length), 0, dragged);

    try {
      if ((dragged.tags[0] ?? null) !== targetTag) {
        await api.saveServer({ ...dragged, tags: retag(dragged.tags, targetTag) });
      }
      await api.reorderServers(gs.flatMap((g) => g.servers.map((s) => s.id)));
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const activeTab = tabs.find((t) => t.serverId === activeId && t.status === "connected");
  const connected = !!activeTab;

  const runSnippet = (sn: Snippet) => {
    const tab = activeTab;
    if (!tab) {
      toast.error("Nenhuma sessão ativa para executar o snippet");
      return;
    }
    api.sshWrite(tab.serverId, b64encode(sn.command + "\n")).catch((e) => toast.error(String(e)));
  };

  const toggleForward = async (s: Server, fwdId: string, isActive: boolean) => {
    try {
      if (isActive) await api.forwardStop(fwdId);
      else {
        const f = await api.forwardStart(s.id, fwdId);
        toast.success(`Túnel ativo: 127.0.0.1:${f.localPort} → ${f.remoteHost}:${f.remotePort}`);
      }
      queryClient.invalidateQueries({ queryKey: ["forwards"] });
    } catch (e) {
      toast.error(String(e));
    }
  };

  const toggleCollapse = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-sidebar border-r border-border">
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border">
        <TerminalSquare className="size-5 text-primary" />
        <span className="font-semibold tracking-tight">SSHDeck</span>
        <div className="ml-auto flex gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Novo servidor"
            onClick={() => setEditServer("new")}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Gerenciar tags"
            onClick={() => setTagsOpen(true)}
          >
            <TagIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Importar servidores"
            onClick={() => setImportOpen(true)}
          >
            <Import className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Exportar servidores"
            onClick={() => setExportOpen(true)}
          >
            <FileDown className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Travar vault" onClick={onLock}>
            <Lock className="size-4" />
          </Button>
        </div>
      </div>

      <div className="p-2 pb-1">
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar servidor ou tag…"
            className="pl-8 h-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {visible.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8 px-4">
            {servers.length === 0
              ? "Nenhum servidor ainda. Adicione um ou importe de CSV/JSON."
              : "Nada encontrado."}
          </p>
        )}
        {groups.map((g) => {
          const key = g.tag ?? NO_TAG;
          const color = colorOf(g.tag);
          const isCollapsed = collapsed.has(key);
          const isDropTarget = dragging && dropTarget === key;
          return (
            <section
              key={key}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setDropTarget(key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                moveServer(g.tag, g.servers.length);
              }}
              className={cn(
                "mb-2 rounded-lg transition-colors",
                isDropTarget && "outline-2 outline-dashed -outline-offset-2",
              )}
              style={isDropTarget ? { outlineColor: color + "88" } : undefined}
            >
              <div className="group/header flex items-center gap-2 px-1.5 py-1 select-none">
                <button
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  onClick={() => toggleCollapse(key)}
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
                  />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-[0.08em] truncate"
                    style={{ color }}
                  >
                    {g.tag ?? "Sem categoria"}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground bg-muted/60 rounded-full px-1.5 py-px">
                    {g.servers.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-muted-foreground/50 ml-auto transition-transform group-hover/header:text-muted-foreground",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                </button>
                {g.tag && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title="Cor da categoria"
                        className="size-3 rounded-full opacity-0 group-hover/header:opacity-100 transition-opacity shrink-0 ring-1 ring-border"
                        style={{ backgroundColor: color }}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto min-w-0">
                      <div className="grid grid-cols-4 gap-2 p-1.5">
                        {TAG_PALETTE.map((c) => (
                          <button
                            key={c}
                            className={cn(
                              "size-5 rounded-full border-2",
                              c === color ? "border-foreground" : "border-transparent",
                            )}
                            style={{ backgroundColor: c }}
                            onClick={async () => {
                              await api.setTagColor(g.tag!, c);
                              queryClient.invalidateQueries({ queryKey: ["vault"] });
                            }}
                          />
                        ))}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {!isCollapsed && (
                <div className="grid gap-1">
                  {g.servers.map((s, idx) => {
                    const tab = tabs.find((t) => t.serverId === s.id);
                    const isActive = tab && activeId === s.id;
                    return (
                      <div
                        key={s.id}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          dragId.current = s.id;
                          setDragging(true);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragging(false);
                          setDropTarget(null);
                        }}
                        onDragOver={(e) => dragging && e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveServer(g.tag, idx);
                        }}
                        onClick={() => connect(s)}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg border px-2 py-1.5 cursor-pointer transition-colors",
                          isActive
                            ? "bg-accent border-border"
                            : "border-transparent hover:bg-accent/50 hover:border-border/60",
                        )}
                      >
                        <div
                          className="relative size-7 rounded-md flex items-center justify-center shrink-0"
                          style={{ backgroundColor: color + "1c" }}
                        >
                          <ServerIcon className="size-3.5" style={{ color }} />
                          {tab && (
                            <span
                              className={cn(
                                "absolute -right-1 -bottom-1 size-2.5 rounded-full border-2 border-sidebar",
                                tab.status === "connected"
                                  ? "bg-emerald-400"
                                  : tab.status === "connecting"
                                    ? "bg-yellow-400 animate-pulse"
                                    : "bg-zinc-500",
                              )}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 grid">
                          <Truncated
                            text={s.name}
                            className="text-[13px] font-medium leading-tight"
                          />
                          <Truncated
                            text={`${s.username}@${s.host}`}
                            tooltip={`${s.username}@${s.host}:${s.port}`}
                            className="text-[11px] text-muted-foreground leading-tight"
                          />
                        </div>
                        {s.tags.length > 1 && (
                          <div className="flex gap-1 shrink-0">
                            {s.tags.slice(1, 3).map((t) => (
                              <span
                                key={t}
                                className="size-1.5 rounded-full"
                                title={t}
                                style={{ backgroundColor: colorOf(t) }}
                              />
                            ))}
                          </div>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 -mr-0.5"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => setEditServer(s)}>
                              <Pencil className="size-4" /> Editar
                            </DropdownMenuItem>
                            {s.forwards.length > 0 && <DropdownMenuSeparator />}
                            {s.forwards.map((f) => {
                              const fActive = !!activeForwards?.some((a) => a.forwardId === f.id);
                              return (
                                <DropdownMenuItem
                                  key={f.id}
                                  onClick={() => toggleForward(s, f.id, fActive)}
                                >
                                  <ArrowLeftRight
                                    className={cn("size-4", fActive && "text-emerald-400")}
                                  />
                                  <span className="flex-1">
                                    {f.label || `${f.localPort} → ${f.remotePort}`}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {fActive ? "parar" : "iniciar"}
                                  </span>
                                </DropdownMenuItem>
                              );
                            })}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 className="size-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                  {g.servers.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60 px-2 py-1 italic">
                      Arraste servidores pra cá
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {connected && (
        <>
          <Separator />
          <div className="p-2 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Snippets
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Novo snippet"
                onClick={() => setEditSnippet("new")}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            {snippets.map((sn) => (
              <div
                key={sn.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60 cursor-pointer"
                onClick={() => runSnippet(sn)}
                title={sn.command}
              >
                <Play className="size-3.5 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{sn.name}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditSnippet(sn);
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
            ))}
            {snippets.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">
                Comandos salvos pra rodar com 1 click na sessão ativa.
              </p>
            )}
          </div>
        </>
      )}

      <UpdateButton />

      <ServerDialog server={editServer} onClose={() => setEditServer(null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <SnippetDialog snippet={editSnippet} onClose={() => setEditSnippet(null)} />
      <TagDialog open={tagsOpen} onClose={() => setTagsOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Excluir servidor?"
        description={`"${deleteTarget?.name}" e as credenciais salvas serão removidos do vault.`}
        onConfirm={async () => {
          const s = deleteTarget!;
          setDeleteTarget(null);
          await api.deleteServer(s.id);
          queryClient.invalidateQueries({ queryKey: ["vault"] });
          undoToast(`Servidor "${s.name}" excluído`, async () => {
            await api.saveServer(s);
            queryClient.invalidateQueries({ queryKey: ["vault"] });
          });
        }}
      />
    </aside>
  );
}
