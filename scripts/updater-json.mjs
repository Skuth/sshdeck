// Gera o latest.json do updater a partir dos assets já publicados na release.
// Uso: node scripts/updater-json.mjs <tag>  (requer gh autenticado / GH_TOKEN)
// Evita a race dos builds paralelos atualizando o mesmo asset.
import { execSync } from "node:child_process";
import fs from "node:fs";

const tag = process.argv[2];
if (!tag) {
  console.error("uso: node scripts/updater-json.mjs <tag>");
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const rel = JSON.parse(sh(`gh release view ${tag} --json assets,body,publishedAt`));
const names = rel.assets.map((a) => a.name);
const url = (n) => `https://github.com/Skuth/sshdeck/releases/download/${tag}/${n}`;
const sig = (n) => sh(`gh release download ${tag} -p "${n}.sig" -O -`).trim();

const platforms = {};
const add = (key, n) => {
  if (n && names.includes(n) && names.includes(`${n}.sig`)) {
    platforms[key] = { signature: sig(n), url: url(n) };
  }
};

add("darwin-aarch64", "SSHDeck_aarch64.app.tar.gz");
add("darwin-x86_64", "SSHDeck_x64.app.tar.gz");
add("linux-x86_64", names.find((n) => n.endsWith(".AppImage")));
add("windows-x86_64", names.find((n) => n.endsWith("-setup.exe")));

const out = {
  version: tag.replace(/^v/, ""),
  notes: rel.body ?? "",
  pub_date: rel.publishedAt,
  platforms,
};
fs.writeFileSync("latest.json", JSON.stringify(out, null, 2));

try {
  sh(`gh release delete-asset ${tag} latest.json -y`);
} catch {}
sh(`gh release upload ${tag} latest.json`);
fs.unlinkSync("latest.json");
console.log(`latest.json de ${tag} publicado com: ${Object.keys(platforms).join(", ")}`);
