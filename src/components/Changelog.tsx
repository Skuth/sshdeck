/** Renderiza o markdown do changelog (formato gerado pela pipeline). */
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="bg-muted px-1 py-px rounded text-[0.85em] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

export default function Changelog({ md }: { md: string }) {
  const out: React.ReactNode[] = [];
  let codeMode = false;
  md.split("\n").forEach((raw, i) => {
    const line = raw.startsWith("> ") ? raw.slice(2) : raw;
    const quoted = raw.startsWith(">");
    if (line.trim() === "```") {
      codeMode = !codeMode;
      return;
    }
    if (codeMode) {
      out.push(
        <pre key={i} className="bg-muted rounded-md px-3 py-2 text-xs font-mono overflow-x-auto">
          {line}
        </pre>,
      );
      return;
    }
    if (!line.trim()) return;
    if (line.startsWith("# ")) return; // título "# Changelog" — o dialog já tem título
    if (line.startsWith("## "))
      out.push(
        <h3 key={i} className="font-semibold text-base mt-3 first:mt-0 text-primary">
          {line.slice(3)}
        </h3>,
      );
    else if (line.trim() === "---") out.push(<hr key={i} className="border-border my-2" />);
    else if (line.startsWith("- "))
      out.push(
        <div key={i} className="flex gap-2 text-sm">
          <span className="text-primary shrink-0">•</span>
          <span>{inline(line.slice(2))}</span>
        </div>,
      );
    else
      out.push(
        <p
          key={i}
          className={
            quoted
              ? "text-xs text-muted-foreground border-l-2 border-primary/40 pl-2.5"
              : "text-sm"
          }
        >
          {inline(line)}
        </p>,
      );
  });
  return <div className="grid gap-1.5">{out}</div>;
}
