import { useQuery } from "@tanstack/react-query";
import Changelog from "@/components/Changelog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ScrollText } from "lucide-react";

const CHANGELOG_URL = "https://raw.githubusercontent.com/Skuth/sshdeck/main/CHANGELOG.md";

export default function ChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["changelog"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(CHANGELOG_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="size-5 text-primary" />
            Changelog
          </DialogTitle>
          <DialogDescription>Todas as versões, da mais recente pra mais antiga.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-background/50 p-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          )}
          {!!error && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Não deu pra buscar o changelog — verifique sua conexão.
            </p>
          )}
          {data && <Changelog md={data} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
