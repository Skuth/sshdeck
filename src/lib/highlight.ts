// Detecção de linguagem + highlight Prism pro editor embutido.
import Prism from "prismjs";
// ordem importa: dependências primeiro
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-properties";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-nginx";
import "prismjs/components/prism-toml";

const BY_EXT: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ini: "ini",
  env: "properties",
  properties: "properties",
  sql: "sql",
  py: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  php: "php",
  md: "markdown",
  markdown: "markdown",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  css: "css",
  scss: "css",
  toml: "toml",
};

/** Nome ou caminho do arquivo → id de linguagem do Prism (null = sem highlight). */
export function detectLang(fileOrPath: string): string | null {
  const full = fileOrPath.toLowerCase();
  const name = full.split("/").pop() ?? full;
  // configs do nginx normalmente não têm extensão (sites-enabled/meusite)
  if (full.includes("/nginx/")) return "nginx";
  if (name === "dockerfile") return "docker";
  if (name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) return "properties";
  if (name.includes("nginx") && name.endsWith(".conf")) return "nginx";
  if (name.endsWith(".conf")) return "ini";
  if (name === ".bashrc" || name === ".zshrc" || name === ".profile" || name === ".bash_profile")
    return "bash";
  const ext = name.split(".").pop() ?? "";
  return BY_EXT[ext] ?? null;
}

export function highlightCode(code: string, lang: string | null): string {
  const grammar = lang ? Prism.languages[lang] : undefined;
  if (!grammar) {
    // sem grammar: escapa HTML puro
    return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  return Prism.highlight(code, grammar, lang!);
}
