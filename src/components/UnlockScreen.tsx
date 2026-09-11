import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, TerminalSquare } from "lucide-react";

export default function UnlockScreen({
  mode,
  onUnlocked,
}: {
  mode: "create" | "unlock";
  onUnlocked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "create" && password !== confirm) {
      setError("As senhas não conferem");
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") await api.vaultCreate(password);
      else await api.vaultUnlock(password);
      onUnlocked();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <form onSubmit={submit} className="w-80 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="size-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <TerminalSquare className="size-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">SSHDeck</h1>
          <p className="text-sm text-muted-foreground text-center">
            {mode === "create"
              ? "Crie uma senha-mestre para proteger seus servidores"
              : "Digite sua senha-mestre para destravar o vault"}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pw">Senha-mestre</Label>
          <Input
            id="pw"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {mode === "create" && (
          <div className="grid gap-2">
            <Label htmlFor="pw2">Confirmar senha</Label>
            <Input
              id="pw2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !password}>
          <Lock className="size-4" />
          {mode === "create" ? "Criar vault" : "Destravar"}
        </Button>
      </form>
    </div>
  );
}
