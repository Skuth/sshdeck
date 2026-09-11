import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { api, Forward, Server } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Plus, Trash2, X } from "lucide-react";

/** Editor de tags em chips: remove com ×, sugere existentes e cria na hora. */
function TagChips({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { data } = useQuery({ queryKey: ["vault"], queryFn: api.getVault });
  const tagColors = data?.tagColors ?? {};
  const [input, setInput] = useState("");
  const norm = input.trim().toLowerCase();

  const suggestions = Object.keys(tagColors)
    .filter((t) => !value.includes(t) && (!norm || t.includes(norm)))
    .sort();
  const canCreate = norm.length > 0 && !tagColors[norm] && !value.includes(norm);

  const add = (t: string) => {
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 min-h-9 focus-within:ring-2 focus-within:ring-ring/50">
        {value.map((t) => {
          const c = tagColors[t] ?? "#8a93a8";
          return (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 text-xs font-medium border"
              style={{ backgroundColor: c + "1f", borderColor: c + "55", color: c }}
            >
              {t}
              <button
                type="button"
                className="rounded-full hover:bg-white/10 p-0.5"
                onClick={() => onChange(value.filter((x) => x !== t))}
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          className="flex-1 min-w-24 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          placeholder={value.length ? "" : "digite pra buscar ou criar…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (norm) add(suggestions[0] === norm || !canCreate ? suggestions[0] ?? norm : norm);
            } else if (e.key === "Backspace" && !input && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {(suggestions.length > 0 || canCreate) && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 8).map((t) => (
            <button
              key={t}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              onClick={() => add(t)}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: tagColors[t] }} />
              {t}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border border-dashed border-primary/50 text-primary hover:bg-primary/10"
              onClick={() => add(norm)}
            >
              <Plus className="size-3" /> criar “{norm}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const empty = (): Server => ({
  id: crypto.randomUUID(),
  name: "",
  host: "",
  port: 22,
  username: "root",
  authType: "password",
  password: "",
  keyPath: "",
  keyPassphrase: "",
  tags: [],
  forwards: [],
});

export default function ServerDialog({
  server,
  onClose,
}: {
  server: Server | "new" | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Server>(empty());

  useEffect(() => {
    if (server === "new") setForm(empty());
    else if (server) setForm({ ...server });
  }, [server]);

  const set = (patch: Partial<Server>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.host || !form.username) {
      toast.error("Host e usuário são obrigatórios");
      return;
    }
    try {
      await api.saveServer({
        ...form,
        name: form.name || `${form.username}@${form.host}`,
      });
      queryClient.invalidateQueries({ queryKey: ["vault"] });
      onClose();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const setForward = (i: number, patch: Partial<Forward>) =>
    set({ forwards: form.forwards.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <Dialog open={server !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server === "new" ? "Novo servidor" : "Editar servidor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input
              placeholder="Produção API"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div className="grid gap-1.5">
              <Label>Host</Label>
              <Input
                placeholder="192.168.0.10 ou meuserver.com"
                value={form.host}
                onChange={(e) => set({ host: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Porta</Label>
              <Input
                type="number"
                value={form.port}
                onChange={(e) => set({ port: Number(e.target.value) || 22 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Usuário</Label>
              <Input value={form.username} onChange={(e) => set({ username: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Autenticação</Label>
              <Select
                value={form.authType}
                onValueChange={(v) => set({ authType: v as Server["authType"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="password">Senha</SelectItem>
                  <SelectItem value="key">Chave privada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.authType === "password" ? (
            <div className="grid gap-1.5">
              <Label>Senha</Label>
              <Input
                type="password"
                value={form.password ?? ""}
                onChange={(e) => set({ password: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label>Arquivo da chave</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="~/.ssh/id_ed25519"
                    value={form.keyPath ?? ""}
                    onChange={(e) => set({ keyPath: e.target.value })}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={async () => {
                      const f = await openFile({ multiple: false });
                      if (typeof f === "string") set({ keyPath: f });
                    }}
                  >
                    <FolderOpen className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Passphrase (opcional)</Label>
                <Input
                  type="password"
                  value={form.keyPassphrase ?? ""}
                  onChange={(e) => set({ keyPassphrase: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="grid gap-1.5">
            <Label>Tags</Label>
            <TagChips value={form.tags} onChange={(tags) => set({ tags })} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Port forwarding (local)</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  set({
                    forwards: [
                      ...form.forwards,
                      {
                        id: crypto.randomUUID(),
                        label: "",
                        localPort: 8080,
                        remoteHost: "127.0.0.1",
                        remotePort: 80,
                      },
                    ],
                  })
                }
              >
                <Plus className="size-3.5" /> Adicionar
              </Button>
            </div>
            {form.forwards.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_70px_1fr_70px_28px] gap-1.5 items-center">
                <Input
                  placeholder="Label"
                  className="h-8"
                  value={f.label}
                  onChange={(e) => setForward(i, { label: e.target.value })}
                />
                <Input
                  type="number"
                  className="h-8"
                  title="Porta local"
                  value={f.localPort}
                  onChange={(e) => setForward(i, { localPort: Number(e.target.value) || 0 })}
                />
                <Input
                  placeholder="Host remoto"
                  className="h-8"
                  value={f.remoteHost}
                  onChange={(e) => setForward(i, { remoteHost: e.target.value })}
                />
                <Input
                  type="number"
                  className="h-8"
                  title="Porta remota"
                  value={f.remotePort}
                  onChange={(e) => setForward(i, { remotePort: Number(e.target.value) || 0 })}
                />
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => set({ forwards: form.forwards.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
