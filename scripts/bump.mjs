// Bump de versão + changelog. Uso: node scripts/bump.mjs <patch|minor|major>
// Atualiza package.json, tauri.conf.json, Cargo.toml e Cargo.lock; gera a seção
// nova do CHANGELOG.md a partir dos commits desde a última tag e grava as notas
// da release em .release-notes.md. Imprime a versão nova no stdout.
import fs from "node:fs";
import { execSync } from "node:child_process";

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("uso: node scripts/bump.mjs <patch|minor|major>");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const [ma, mi, pa] = pkg.version.split(".").map(Number);
const version =
  bump === "major" ? `${ma + 1}.0.0` : bump === "minor" ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

pkg.version = version;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
conf.version = version;
fs.writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");

const cargo = fs
  .readFileSync("src-tauri/Cargo.toml", "utf8")
  .replace(/^version = ".*"$/m, `version = "${version}"`);
fs.writeFileSync("src-tauri/Cargo.toml", cargo);

const lock = fs
  .readFileSync("src-tauri/Cargo.lock", "utf8")
  .replace(/(name = "sshdeck"\nversion = )"[^"]*"/, `$1"${version}"`);
fs.writeFileSync("src-tauri/Cargo.lock", lock);

// commits desde a última tag (ou todos, se for a primeira release)
let range = "";
try {
  const last = execSync("git describe --tags --abbrev=0", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
  range = `${last}..HEAD`;
} catch {}
const commits = execSync(`git log ${range} --pretty=%s`)
  .toString()
  .trim()
  .split("\n")
  .filter((l) => l && !l.startsWith("Chore: release"));

const date = new Date().toISOString().slice(0, 10);
const section = `## v${version} — ${date}\n\n${commits.map((c) => `- ${c}`).join("\n")}\n`;

const old = fs.existsSync("CHANGELOG.md")
  ? fs.readFileSync("CHANGELOG.md", "utf8").replace(/^# Changelog\n+/, "")
  : "";
fs.writeFileSync("CHANGELOG.md", `# Changelog\n\n${section}\n${old}`);
fs.writeFileSync(".release-notes.md", section);

console.log(version);
