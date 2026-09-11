// Self-check do parser de import. Rodar: node src/lib/importParse.check.ts
import assert from "node:assert";
import { parseCsv, parseServers } from "./importParse.ts";

let n = 0;
const id = () => `id-${n++}`;

// CSV com aspas, vírgula dentro de campo e CRLF
const csv = `name,host,port,username,password,tags\r\n"API, Prod",10.0.0.5,2222,deploy,"se""nha",prod;aws\nDB,db.local,,root,123,`;
const fromCsv = parseServers(csv, id);
assert.equal(fromCsv.length, 2);
assert.equal(fromCsv[0].name, "API, Prod");
assert.equal(fromCsv[0].port, 2222);
assert.equal(fromCsv[0].password, 'se"nha');
assert.deepEqual(fromCsv[0].tags, ["prod", "aws"]);
assert.equal(fromCsv[1].port, 22); // porta vazia → default 22
assert.equal(fromCsv[1].name, "DB");

// JSON, campos alternativos e keyPath → authType key
const json = JSON.stringify([
  { hostname: "a.com", user: "ubuntu", key_path: "/home/u/.ssh/id_rsa", tags: ["x"] },
  { host: "" }, // sem host → descartado
]);
const fromJson = parseServers(json, id);
assert.equal(fromJson.length, 1);
assert.equal(fromJson[0].authType, "key");
assert.equal(fromJson[0].username, "ubuntu");
assert.deepEqual(fromJson[0].tags, ["x"]);

// vazio e CSV só com cabeçalho
assert.deepEqual(parseServers("", id), []);
assert.deepEqual(parseServers("name,host", id), []);
assert.equal(parseCsv('a,"b\nc"')[0][1], "b\nc");

console.log("importParse: todos os checks passaram");
