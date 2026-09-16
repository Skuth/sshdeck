<div align="center">

<img src="assets/banner.svg" alt="SSHDeck" width="100%" />

# SSHDeck

**Cliente SSH estilo Termius — rápido, dark e com suas credenciais criptografadas.**

[![Release](https://img.shields.io/github/v/release/Skuth/sshdeck?sort=semver&style=flat-square&color=57d9a3&labelColor=1c2028)](https://github.com/Skuth/sshdeck/releases)
[![License](https://img.shields.io/badge/license-MIT-6ea8f7?style=flat-square&labelColor=1c2028)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-c795f0?style=flat-square&labelColor=1c2028)](https://tauri.app)
[![Platform](https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-e8c26e?style=flat-square&labelColor=1c2028)](https://github.com/Skuth/sshdeck/releases)

[Instalação](#-instalação) · [Funcionalidades](#-funcionalidades) · [Monitor](#-modo-monitor) · [Rodando local](#-rodando-local) · [Release](#-build--release) · [Importação](#-importando-servidores) · [Segurança](#-segurança) · [Contribuindo](#-contribuindo)

</div>

---

## ✨ Funcionalidades

| | |
|---|---|
| 🔐 **Vault criptografado** | Servidores e senhas em arquivo local cifrado (Argon2id + AES-256-GCM), destravado com senha-mestre |
| ⚡ **Conexão em 2 clicks** | Credenciais salvas (senha ou chave privada) — clicou, conectou |
| 🗂️ **Abas** | Uma aba por conexão; clicar num servidor já conectado só foca a aba, nunca duplica |
| 🏷️ **Tags com cor** | Categorias coloridas, agrupamento na sidebar e **drag & drop** pra reorganizar e mover entre grupos |
| 📁 **SFTP** | Navegador de arquivos por sessão — duplo click baixa direto pro seu computador, com barra de progresso; pastas inteiras e multi-seleção |
| 🗃️ **Modo Arquivos (GUI)** | Gerenciador de arquivos em tela cheia com editor embutido (syntax highlight), grid, menu de contexto, renomear, ou abrir em `nano`/`vim` no terminal |
| 📊 **Modo Monitor** | KPIs do servidor (CPU, memória, disco, uptime), stack instalada, PM2 ao vivo com detalhe por processo, sites nginx, logs Laravel, ações rápidas e kit de ajuda — [detalhes](#-modo-monitor) |
| 📥 **Importação / exportação** | Importa CSV/JSON (cole ou escolha o arquivo; duplicados são atualizados) e exporta o vault confirmando a senha-mestre |
| ▶️ **Snippets** | Comandos salvos que rodam com 1 click na sessão ativa (aparecem só com uma sessão conectada) |
| 🔀 **Port forwarding** | Túneis locais por servidor, liga/desliga no menu do servidor |
| 🧭 **Conexão explicada** | Overlay mostra cada etapa em tempo real (DNS → TCP → handshake → host key → auth → shell), com retry e cancelamento |
| 🛡️ **Host key TOFU** | Fingerprint salva no primeiro acesso; se mudar, a conexão é recusada (proteção MITM) |
| 🔄 **Auto-update** | Checa releases assinadas a cada 5 min (ou no botão), mostra as notas e instala com 1 click; changelog completo dentro do app |
| 🚪 **Fechamento limpo** | Fechar a aba manda `exit` pro shell remoto antes de derrubar o canal — sem sessão sshd órfã no servidor |

## 📊 Modo Monitor

Com uma sessão conectada, o seletor na barra de abas alterna entre **Terminal**, **Arquivos** e **Monitor**. O Monitor roda comandos de leitura pela sessão auxiliar (a mesma do SFTP) e renderiza tudo formatado, sem você digitar nada:

- **Servidor:** load/CPU, memória, disco e uptime com sparklines, a cada 5s
- **Stack instalada:** versões de PHP, Composer, Node, npm, PM2, nginx, Docker, git e o SO
- **PM2:** tabela ao vivo com id, modo (**cluster** com índice da instância, ou fork), badge **worker** pra processos de fila, status, CPU com histórico, memória, restarts e uptime. **Clicar na linha abre o "monit" daquele processo em tempo real** (2s): CPU e memória com gráfico, restarts instáveis, métricas custom do `pm2 monit` (heap, event loop…), script/cwd/node/logs, tail do stdout/stderr e ações restart · reload (cluster) · stop/start · seguir logs no terminal
- **Ações rápidas** (aparecem conforme o que está instalado): testar/reload da config do nginx, log de erros, **gerenciador de sites** (ativar/desativar, criar com template e editar no editor embutido), logs Laravel parseados por nível, log do PHP-FPM, containers e uso do Docker, serviços com falha, disco por pasta e top processos. Várias são "ao vivo" (auto-refresh)
- **Kit de ajuda:** receitas prontas (criar usuário, sudo, chave SSH, ufw, certbot…) pra copiar ou rodar no terminal

## 📦 Instalação

Baixe o instalador do seu sistema na página de [**Releases**](https://github.com/Skuth/sshdeck/releases):

| Sistema | Arquivo |
|---|---|
| 🍎 macOS (Apple Silicon) | `SSHDeck_x.x.x_aarch64.dmg` |
| 🍎 macOS (Intel) | `SSHDeck_x.x.x_x64.dmg` |
| 🪟 Windows | `SSHDeck_x.x.x_x64-setup.exe` ou `.msi` |
| 🐧 Linux | `.AppImage`, `.deb` ou `.rpm` |

> **macOS:** o app não é assinado/notarizado (sem conta de desenvolvedor). Se aparecer
> "app danificado" ou o Gatekeeper bloquear, rode uma vez no Terminal:
>
> ```sh
> xattr -dr com.apple.quarantine /Applications/SSHDeck.app
> ```

Na primeira abertura, crie sua **senha-mestre** — ela protege o vault com todos os servidores e senhas.

## 🧑‍💻 Rodando local

Pré-requisitos:

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable)
- **Linux:** `libwebkit2gtk-4.1-dev build-essential libssl-dev librsvg2-dev libayatana-appindicator3-dev`

```sh
git clone https://github.com/Skuth/sshdeck.git
cd sshdeck
npm install
npm run tauri dev     # desenvolvimento com hot reload
```

Verificação rápida do parser de importação:

```sh
node --experimental-strip-types src/lib/importParse.check.ts
```

## 🚀 Build & Release

Build local do instalador do seu sistema:

```sh
npm run tauri build   # sai em src-tauri/target/release/bundle/
```

### Pipeline de release (manual, com versionamento automático)

O workflow [`release.yml`](.github/workflows/release.yml) cuida de tudo — você só escolhe o tamanho do bump:

1. GitHub → **Actions** → **Release** → **Run workflow**
2. Escolha o bump: `patch`, `minor` ou `major`
3. A pipeline então:
   - bumpa a versão em `package.json`, `tauri.conf.json`, `Cargo.toml` e `Cargo.lock` ([`scripts/bump.mjs`](scripts/bump.mjs))
   - gera a seção nova do [`CHANGELOG.md`](CHANGELOG.md) a partir dos **changesets** em [`.changeset/`](.changeset/README.md) (fallback: commits desde a última release) e apaga os arquivos consumidos
   - commita, cria a tag `vX.Y.Z` e faz push
   - builda **macOS (arm64 + Intel), Windows e Linux**, publica a Release com o changelog no corpo e gera o `latest.json` assinado que o auto-update do app consome

Pela linha de comando: `gh workflow run Release -f bump=minor`

## 📥 Importando servidores

Botão **Importar** na sidebar — cole o conteúdo ou escolha um arquivo.

**CSV** (cabeçalho obrigatório; tags separadas por `;`):

```csv
name,host,port,username,password,tags
API Prod,10.0.0.5,22,root,s3nh4,produção;aws
Banco,10.0.0.6,2222,deploy,outra$enha,databases
```

**JSON** (array com os mesmos campos; aceita também `user`, `hostname`, `keyPath`, `passphrase`):

```json
[
  { "name": "API Prod", "host": "10.0.0.5", "username": "root", "password": "s3nh4", "tags": ["produção"] },
  { "name": "Com chave", "host": "10.0.0.7", "username": "deploy", "keyPath": "/Users/eu/.ssh/id_ed25519" }
]
```

- Servidor com `keyPath` entra como autenticação por **chave privada**; sem, como **senha**
- Duplicados (mesmo host + porta + usuário) são **atualizados**, não duplicados
- Tag nova ganha uma cor automática da paleta — troque no gerenciador de tags (ícone 🏷️ na sidebar)

## 🔐 Segurança

- O vault (`vault.bin`) é cifrado com **AES-256-GCM**; a chave vem da senha-mestre via **Argon2id** — nada é gravado em texto plano
- A senha-mestre **não é armazenada** em lugar nenhum; sem ela, o arquivo é inútil
- **Host key TOFU**: a fingerprint SHA-256 de cada servidor é salva no primeiro connect (`known_hosts.json`) e a conexão é recusada se mudar
- Senhas nunca saem da sua máquina — a conexão SSH é feita direto pelo app (libssh2)

## 🤝 Contribuindo

As regras estão em [**AGENTS.md**](AGENTS.md) — valem pra pessoas e pra qualquer agente de código. Resumo:

- Todo PR que muda comportamento traz um **changeset** em [`.changeset/`](.changeset/README.md) (uma linha por mudança, em inglês, prefixo `Feat:`/`Fix:`/`Chore:`/`Refact:`)
- Mudou algo que está neste README (funcionalidade, instalação, importação, release, segurança)? **Atualiza o README no mesmo PR**
- `CHANGELOG.md` e versão são gerados pela pipeline — não edite à mão
- Commits em inglês com os mesmos quatro prefixos; comentário no código só onde explica um *porquê*

## 🛠️ Stack

[Tauri 2](https://tauri.app) (Rust) · [React 19](https://react.dev) + TypeScript · [shadcn/ui](https://ui.shadcn.com) + Tailwind 4 · [zustand](https://zustand.docs.pmnd.rs) · [TanStack Query](https://tanstack.com/query) · [xterm.js](https://xtermjs.org) · [ssh2/libssh2](https://libssh2.org)

## 📄 Licença

[MIT](LICENSE) © [Skuth](https://github.com/Skuth)
