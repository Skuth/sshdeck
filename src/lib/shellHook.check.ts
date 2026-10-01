// node --experimental-strip-types src/lib/shellHook.check.ts
// Roda o hook nos shells que existirem na máquina (bash, zsh, dash) em modo interativo.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDIT_PREFIX, HOOK_READY, SHELL_HOOK } from "./shellHook.ts";

assert.ok(!SHELL_HOOK.includes("!"), "sem ! — history expansion quebra a linha");
assert.ok(!SHELL_HOOK.includes("\n"), "uma linha só");
assert.ok(SHELL_HOOK.startsWith(" "), "espaço na frente, fora do histórico");

const dir = realpathSync(mkdtempSync(join(tmpdir(), "sshdeck-hook-")));
writeFileSync(join(dir, "f.txt"), "oi\n");
mkdirSync(join(dir, "sub"));

const shells: [string, string[]][] = [
  ["/bin/bash", ["--norc", "--noprofile", "-i"]],
  ["/bin/zsh", ["-f", "-i"]],
  ["/bin/dash", ["-i"]],
];
let ran = 0;
for (const [sh, args] of shells) {
  if (!existsSync(sh)) continue;
  ran++;
  const input = [SHELL_HOOK, "echo antes", "false", "echo st=$?", "nano f.txt", "cd sub", "history", "exit", ""].join("\n");
  const out = spawnSync(sh, args, {
    cwd: dir,
    input,
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: dir, HISTFILE: "/dev/null", TERM: "dumb" },
  }).stdout;
  assert.ok(out.includes(HOOK_READY), `${sh}: marcador de pronto`);
  assert.ok(out.includes(`\x1b]1337;${EDIT_PREFIX}${dir}/f.txt\x07`), `${sh}: nano vira OSC do editor`);
  assert.ok(out.includes("st=1"), `${sh}: $? preservado`);
  if (!sh.endsWith("dash")) {
    assert.ok(out.includes(`\x1b]7;${dir}/sub\x07`), `${sh}: OSC 7 com o cwd`);
  }
  if (sh.endsWith("bash")) assert.ok(!out.includes("__sd_edit"), "bash: hook fora do histórico");
}
assert.ok(ran > 0, "nenhum shell disponível");
console.log(`shellHook ok (${ran} shell(s))`);
