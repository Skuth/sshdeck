# Guia para contribuir (humanos e agentes)

Este arquivo é a fonte única de regras do repositório. Vale para qualquer pessoa ou
agente de código (Claude Code, Codex, Cursor, Copilot, Gemini CLI etc.). `CLAUDE.md`
só aponta pra cá — não duplique regras em outro lugar.

## O que é o projeto

SSHDeck é um cliente SSH desktop (Tauri 2 + Rust no backend, React 19 + TypeScript
no frontend) com vault criptografado, abas, SFTP/GUI de arquivos, snippets, port
forwarding e um modo Monitor (KPIs do servidor, PM2, nginx, logs).

```
src/                     frontend React
  components/            telas e painéis (um arquivo por feature)
  components/ui/         shadcn/ui gerado — não editar à mão, regenerar via shadcn
  lib/api.ts             wrapper tipado dos comandos Tauri (invoke)
  lib/store.ts           estado global (zustand): abas e views
src-tauri/src/           backend Rust
  lib.rs                 registro dos comandos (generate_handler!)
  vault.rs               vault cifrado (Argon2id + AES-GCM), servidores, snippets
  ssh.rs                 sessão de terminal, open_session compartilhado
  sftp.rs                SFTP + ssh_exec (sessão auxiliar usada pelo Monitor)
  forward.rs             túneis locais
scripts/                 bump.mjs (versão + changelog) e updater-json.mjs
.changeset/              changesets pendentes — viram o CHANGELOG na release
.github/workflows/       release.yml (manual, gera versão, builda e publica)
```

Idioma: código, comentários, textos de UI e docs em **português**. Commits, PRs e
changesets em **inglês**.

## Comandos

```sh
npm install
npm run tauri dev                                  # app com hot reload
npx tsc --noEmit -p .                              # typecheck do frontend
npm run build                                      # build do frontend (vite)
cargo check --manifest-path src-tauri/Cargo.toml   # compila o backend
node --experimental-strip-types src/lib/importParse.check.ts   # check do parser de import
npm run tauri build                                # instalador local
```

Antes de abrir PR, os quatro primeiros checks têm que passar. Não há suíte de testes
formal; lógica não trivial nova deixa um check pequeno e executável (padrão
`*.check.ts` com `assert`), sem framework.

## Regras de PR (obrigatórias)

1. **Changeset.** Todo PR que muda comportamento, corrige bug ou mexe em build/config
   cria um arquivo novo em `.changeset/` (formato em
   [`.changeset/README.md`](.changeset/README.md)). Sem changeset, o PR não entra.
   Exceção: mudança só de docs.
2. **README atualizado** quando a mudança toca algo que está (ou deveria estar) lá:
   funcionalidade visível ao usuário, instalação, importação/exportação, release,
   segurança, stack. A tabela de funcionalidades do README é a vitrine — feature nova
   entra nela.
3. **Não editar `CHANGELOG.md` nem bumpar versão à mão.** A pipeline de release
   faz isso a partir dos changesets (`scripts/bump.mjs`). `package.json`,
   `tauri.conf.json`, `Cargo.toml` e `Cargo.lock` só mudam de versão pela pipeline.
4. **Comando Tauri novo** = função em Rust + registro no `generate_handler!` em
   `lib.rs` + wrapper tipado em `src/lib/api.ts`. Os três juntos, no mesmo PR.
5. **Sem dependência nova** sem justificativa no PR. Se a stdlib, o Rust padrão ou
   algo já instalado resolve, use isso.
6. **Segurança não se simplifica:** validação em fronteira de confiança, tratamento
   de erro que evita perda de dados, TOFU de host key e vault ficam como estão ou
   ficam mais fortes. Nunca commitar credenciais — `servers.local.json` e `*.local`
   estão no `.gitignore` de propósito.
7. PR pequeno e focado. Refatoração oportunista vai em PR separado.

## Commits

- Prefixo obrigatório, capitalizado, seguido de dois pontos: `Feat:`, `Fix:`,
  `Chore:`, `Refact:`. Nada além desses quatro (sem `docs:`, `test:`, escopo entre
  parênteses ou minúsculas).
- Título e corpo em inglês, no imperativo, descrevendo o efeito e não o arquivo.
- Sem trailer de co-autoria nem atribuição a IA (`Co-Authored-By`, "Generated with",
  emoji de robô). Isso vale para commits e para corpo de PR.

## Estilo de código

- **Comentário só onde precisa.** Comente o *porquê* de algo não óbvio (uma
  restrição, um workaround, um limite conhecido), nunca o *quê* que o código já
  diz. Nada de comentário em cada função, em cada bloco, ou repetindo o nome da
  variável. Se o código precisa de comentário pra ser entendido, primeiro tente
  renomear ou simplificar. Comentário de seção (`/* ---- x ---- */`) só em arquivo
  grande com partes claramente distintas.
- Atalho deliberado com teto conhecido leva um comentário `ponytail:` dizendo o
  teto e o caminho de upgrade (ex.: `// ponytail: mutex global, 1 transferência por
  servidor; por-arquivo se precisar`). Não invente outros marcadores.
- Menor diff que funciona. Sem abstração para um único uso, sem config para valor
  que nunca muda, sem scaffolding "pra depois".
- Reuse o que já existe: `Truncated`, `ConfirmDialog`, `formatBytes`, `b64encode`,
  os componentes em `components/ui`, `open_session` no Rust. Procure antes de escrever.
- TypeScript estrito (`noUnusedLocals`/`noUnusedParameters` ativos). Sem `any`
  fora de parsing de JSON externo.
- Cores e tokens visuais seguem os já usados (`#57d9a3` ok, `#e8c26e` alerta,
  `#f2778c` erro, `#6ea8f7` info). Textos de UI em português informal, direto.
- Comandos remotos do Monitor são shell POSIX simples, idempotentes e com fallback
  (`sudo -n … || …; true`), porque rodam sem TTY e sem senha.
- Rust: erros viram `Result<_, String>` com mensagem em português pro usuário;
  trabalho bloqueante em comando Tauri roda em `spawn_blocking`.

## Release

Manual, pelo GitHub Actions (**Release** → `bump`: patch/minor/major) ou
`gh workflow run Release -f bump=minor`. A pipeline consome os changesets, gera o
CHANGELOG, commita, tagueia, builda macOS/Windows/Linux e publica a Release com o
`latest.json` do auto-update. Detalhes no README.
