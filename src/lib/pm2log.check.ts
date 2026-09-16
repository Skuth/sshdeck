// node --experimental-strip-types src/lib/pm2log.check.ts
import assert from "node:assert/strict";
import { parseLogLine, parsePm2Logs, tsShort } from "./pm2log.ts";

const l1 = parseLogLine(
  "[2026-09-16 20:14:35][581820] Processing: App\\Jobs\\CalculateMatchScore",
  "out",
);
assert.equal(l1.ts, "2026-09-16 20:14:35");
assert.deepEqual(l1.tags, ["581820"]);
assert.equal(l1.msg, "Processing: App\\Jobs\\CalculateMatchScore");
assert.equal(l1.tone, "info");

const l2 = parseLogLine(
  "[2026-09-16 20:14:37][581820] Processed:  App\\Jobs\\CalculateMatchScore",
  "out",
);
assert.equal(l2.tone, "ok");

const l3 = parseLogLine('[2026-09-16 10:00:00] production.ERROR: Boom {"x":1}', "err");
assert.deepEqual(l3.tags, ["ERROR"]);
assert.equal(l3.tone, "err");
assert.equal(l3.msg, 'Boom {"x":1}');

const l4 = parseLogLine("2026-09-16T20:14:35: server listening on 3000", "out");
assert.equal(l4.ts, "2026-09-16T20:14:35");
assert.equal(l4.msg, "server listening on 3000");
assert.equal(l4.tone, "ok");

const l5 = parseLogLine("#3 /var/www/vendor/laravel/framework/src/Foo.php(12): bar()", "err");
assert.equal(l5.cont, true);
assert.equal(l5.tone, "plain");

const l6 = parseLogLine("something odd on stderr", "err");
assert.equal(l6.tone, "err");
assert.equal(l6.ts, undefined);

// intercala por horário, mantendo linha sem ts junto da anterior do mesmo stream
const merged = parsePm2Logs(
  [
    "O|[2026-09-16 10:00:01][1] Processing: A",
    "O|[2026-09-16 10:00:05][1] Processed: A",
    "E|[2026-09-16 10:00:03] local.ERROR: fail",
    "E|#0 trace line",
    "E|",
  ].join("\n"),
);
assert.deepEqual(
  merged.map((l) => `${l.stream}:${l.msg}`),
  ["out:Processing: A", "err:fail", "err:#0 trace line", "out:Processed: A"],
);

const today = new Date().toISOString().slice(0, 10);
assert.equal(tsShort(`${today} 20:14:35`), "20:14:35");
assert.equal(tsShort("2026-01-02 03:04:05"), "02/01 03:04:05");

console.log("pm2log ok");
