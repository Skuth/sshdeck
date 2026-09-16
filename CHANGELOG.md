# Changelog

## v0.8.1 — 2026-09-16

- Fix: remote exec sets up PATH (nvm, volta, npm -g) so PM2 installed per-user is detected in Monitor; jlist parsing tolerates pm2 notices and errors are shown instead of an empty table
- Fix: Monitor sparklines are fluid-width with headroom on auto-scale, no longer overflowing cards
- Feat: parsed PM2 log viewer in the process detail: timestamp, pid/level chips, color by severity, stdout/stderr filter, merged by time

## v0.8.0 — 2026-09-16

- Feat: live per-process PM2 detail (CPU, memory, custom metrics, logs) opened from the Monitor table, with exec mode, instance and worker badges
- Feat: PM2 process actions in the detail view: restart, reload (cluster), stop/start and follow logs in terminal
- Fix: send exit and EOF to the remote shell before closing the SSH channel so no orphan sessions stay open
- Fix: hide the snippets section in the sidebar when no session is connected
- Fix: show changelog dates as DD/MM/YYYY in the app
- Chore: replace Laravel artisan queue polling in Monitor with PM2-based worker status
- Chore: changesets in .changeset/ feed the changelog on release; contributor rules in AGENTS.md

## v0.7.0 — 2026-09-13

- Feat: queue monitoring in Monitor with pending/failed KPIs, worker status and retry/flush actions

## v0.6.0 — 2026-09-13

- Feat: Monitor mode with system KPIs, PM2 dashboard, nginx site manager, Laravel logs, DevOps help kit and tooltip on truncated text

## v0.5.1 — 2026-09-13

- Feat: update polling every 5 minutes and manual check-for-updates button

## v0.5.0 — 2026-09-13

- Feat: GUI file manager mode with embedded syntax-highlighted editor, grid view, context menu and rename
- Fix: generate updater latest.json in a single job to avoid race between parallel builds

## v0.4.0 — 2026-09-13

- Feat: open remote files in nano/vim from the SFTP panel
- Feat: full changelog viewer, server export with vault confirmation, semver release badge

## v0.3.0 — 2026-09-13

- Fix: sync main before version bump in release pipeline
- Feat: in-app auto-update with signed releases and formatted changelog
- Chore: document automated release flow in README

## v0.2.0 — 2026-09-13

- Chore: automated version bump and changelog in release pipeline
- Feat: download entire folders and multi-select files in SFTP

