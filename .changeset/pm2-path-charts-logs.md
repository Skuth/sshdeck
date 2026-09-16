Fix: remote exec sets up PATH (nvm, volta, npm -g) so PM2 installed per-user is detected in Monitor; jlist parsing tolerates pm2 notices and errors are shown instead of an empty table
Fix: Monitor sparklines are fluid-width with headroom on auto-scale, no longer overflowing cards
Feat: parsed PM2 log viewer in the process detail: timestamp, pid/level chips, color by severity, stdout/stderr filter, merged by time
