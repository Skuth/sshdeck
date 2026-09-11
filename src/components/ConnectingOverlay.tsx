import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTabs } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Check, Loader2, RotateCcw, ServerCrash, Unplug } from "lucide-react";

export const STAGES = [
  { id: "resolvendo-dns", label: "Resolvendo DNS", detail: "Traduzindo o host para endereço IP" },
  { id: "conectando-tcp", label: "Conectando", detail: "Abrindo conexão TCP com o servidor" },
  { id: "handshake", label: "Handshake SSH", detail: "Negociando algoritmos e criptografia" },
  {
    id: "verificando-host-key",
    label: "Verificando identidade",
    detail: "Conferindo a fingerprint contra o known_hosts",
  },
  { id: "autenticando", label: "Autenticando", detail: "Enviando credenciais salvas" },
  { id: "abrindo-shell", label: "Abrindo terminal", detail: "Solicitando PTY e shell remoto" },
] as const;

export default function ConnectingOverlay({
  serverId,
  name,
  stage,
  error,
  closed,
  onRetry,
}: {
  serverId: string;
  name: string;
  stage: string | null;
  error: string | null;
  closed: boolean;
  onRetry: () => void;
}) {
  const current = STAGES.findIndex((s) => s.id === stage);

  const closeTab = () => {
    api.sshDisconnect(serverId).catch(() => {});
    useTabs.getState().closeTab(serverId);
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0e14]/90 backdrop-blur-sm">
      <div className="w-96 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          {closed ? (
            <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Unplug className="size-5 text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="size-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
              <ServerCrash className="size-5 text-destructive" />
            </div>
          ) : (
            <Loader2 className="size-6 text-primary animate-spin shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-medium truncate">
              {closed ? "Conexão encerrada" : error ? "Falha na conexão" : "Conectando…"}
            </p>
            <p className="text-sm text-muted-foreground truncate">{name}</p>
          </div>
        </div>

        {closed ? (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            A sessão foi finalizada — por um <code className="text-foreground/80">exit</code>, pelo
            servidor ou por queda de rede. Você pode reconectar quando quiser; suas credenciais
            continuam salvas.
          </p>
        ) : (
          <ol className="grid gap-2.5">
            {STAGES.map((s, i) => {
              const done = i < current;
              const active = i === current;
              const failed = !!error && active;
              return (
                <li key={s.id} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 size-4 rounded-full flex items-center justify-center shrink-0 border",
                      done && "bg-primary/20 border-primary/50",
                      active && !failed && "border-primary",
                      failed && "border-destructive bg-destructive/20",
                      !done && !active && "border-border",
                    )}
                  >
                    {done && <Check className="size-3 text-primary" />}
                    {active && !failed && (
                      <Loader2 className="size-3 text-primary animate-spin" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm leading-tight",
                        failed && "text-destructive",
                        !done && !active && "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </p>
                    {(active || failed) && (
                      <p className="text-xs text-muted-foreground leading-snug">{s.detail}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/25 rounded-md p-2.5 mt-4 break-words">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          {error || closed ? (
            <>
              <Button variant="ghost" size="sm" onClick={closeTab}>
                Fechar aba
              </Button>
              <Button size="sm" onClick={onRetry}>
                <RotateCcw className="size-3.5" />
                {closed ? "Reconectar" : "Tentar novamente"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={closeTab}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
