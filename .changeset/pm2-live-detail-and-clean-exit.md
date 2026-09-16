Feat: live per-process PM2 detail (CPU, memory, custom metrics, logs) opened from the Monitor table, with exec mode, instance and worker badges
Feat: PM2 process actions in the detail view: restart, reload (cluster), stop/start and follow logs in terminal
Fix: send exit and EOF to the remote shell before closing the SSH channel so no orphan sessions stay open
Fix: hide the snippets section in the sidebar when no session is connected
Fix: show changelog dates as DD/MM/YYYY in the app
Chore: replace Laravel artisan queue polling in Monitor with PM2-based worker status
Chore: changesets in .changeset/ feed the changelog on release; contributor rules in AGENTS.md
