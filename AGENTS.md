# Daijest Frontend Instructions

This is the frontend repository for Daijest. The app is served as static files by nginx.

## Required Checks

- Run `Get-ChildItem js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }` on Windows/PowerShell before finishing frontend JavaScript changes.
- In bash, the equivalent is `for f in $(find js -name '*.js'); do node --check "$f"; done`.
- Run `docker compose -f deploy/docker-compose.yml config` when touching deploy files.

## Production Deployment

- Production runs on `ssh ant` under `/opt/daijest`.
- Do not patch `/opt/daijest/frontend` directly on the server.
- Fixes must be made in this repository, committed, and pushed to `main`.
- The server-side `/opt/daijest/deploy-daijest.sh` script is triggered by `daijest-update.timer` and updates this checkout with `git reset --hard origin/main`.
- Manual server edits are temporary by definition and will be overwritten by the next deployment.

## Frontend Notes

- Main HTML entrypoint: `digest-builder.html`.
- JavaScript modules live in `js`.
- API requests are built from `API_BASE` in `js/config.js`.
- Production is served from the site root and uses `/api` for backend requests.
- The frontend nginx proxies `/api/` and `/healthz` to the backend container.
- Локальный черновик нельзя переносить между пользователями: при выходе он очищается, а пустой профиль создаётся из начального состояния.

## Server Verification

- `ssh ant 'systemctl status daijest-update.service --no-pager'`
- `ssh ant 'journalctl -u daijest-update.service -n 200 --no-pager'`
- `ssh ant 'curl -fsSI http://127.0.0.1/'`
- `ssh ant 'curl -fsS http://127.0.0.1/healthz'`
- If git reports dubious ownership, use `git -c safe.directory=/opt/daijest/frontend -C /opt/daijest/frontend ...` for read-only diagnostics.
