import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Texto truncado sempre ganha tooltip com o conteúdo completo. */
export default function Truncated({
  text,
  tooltip,
  className,
  mono = false,
}: {
  text: string;
  /** conteúdo do tooltip — por padrão o próprio texto completo */
  tooltip?: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("truncate min-w-0", className)}>{text}</span>
      </TooltipTrigger>
      <TooltipContent className={cn("max-w-md break-all", mono && "font-mono text-[11px]")}>
        {tooltip ?? text}
      </TooltipContent>
    </Tooltip>
  );
}
