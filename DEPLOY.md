# Deploying PartPilot to the VPS (Node + PM2 + nginx)

Target: `https://ikiousa.tech/partpilot/` on the Hostinger VPS (72.61.243.59).
This replaces the old Dockerized `/partpilot` app with the new standalone build.

The Node app serves **both** the API and the built React SPA on one port (4100).
nginx proxies `/partpilot/` to it (stripping the prefix). PM2 keeps it running.

---

## Prerequisites on the VPS (one-time)

```bash
# Node 18+ and PM2
node -v || curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
npm i -g pm2

# MySQL: create the database + a user (skip if you already have one)
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS partpilot;
  CREATE USER IF NOT EXISTS 'partpilot'@'localhost' IDENTIFIED BY 'CHANGE_ME';
  GRANT ALL PRIVILEGES ON partpilot.* TO 'partpilot'@'localhost'; FLUSH PRIVILEGES;"
```

## 1. Get the code

```bash
# Fresh clone (recommended — the old /root/partpilot is the Docker monorepo)
cd /root
git clone https://github.com/divya053/partpilot.git partpilot-app
cd partpilot-app
# (later updates: cd /root/partpilot-app && git pull)
```

## 2. Configure the API

```bash
cd /root/partpilot-app/server
cp .env.production.example .env
nano .env      # set DB_PASSWORD, a long SESSION_SECRET; keep SESSION_COOKIE_PATH=/partpilot
npm install --omit=dev
```

## 3. Build the SPA (with the /partpilot base path)

```bash
cd /root/partpilot-app/client
npm install
VITE_BASE_PATH=/partpilot/ npm run build      # -> client/dist
```

## 4. Start with PM2

```bash
cd /root/partpilot-app
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs partpilot --lines 30     # first boot auto-migrates + seeds MySQL
```
Verify locally on the box: `curl -s http://127.0.0.1:4100/api/health` → `{"ok":true,...}`

## 5. Point nginx at it

Edit the nginx file that actually serves ikiousa.tech
(**/etc/nginx/sites-enabled/escotracker.conf** on this VPS), replace the old
`location /partpilot { ... }` (Docker :8080) with the block from
[`deploy/nginx-partpilot.conf`](deploy/nginx-partpilot.conf), then:

```bash
nginx -t && systemctl reload nginx
```

## 6. Retire the old Docker app (frees :8080)

```bash
cd /root/partpilot && docker compose -f docker-compose.subpath.yml down   # old build
```

Open **https://ikiousa.tech/partpilot/** and log in (master / master123 — change it after).

---

## Updating later

```bash
cd /root/partpilot-app && git pull
cd server && npm install --omit=dev
cd ../client && npm install && VITE_BASE_PATH=/partpilot/ npm run build
cd .. && pm2 restart partpilot
```

## Notes
- First boot seeds 193 part numbers + 219 segment values. To reset: drop & recreate the
  `partpilot` DB, then `pm2 restart partpilot`.
- Change the demo passwords in **User Management** after first login.
- Cookies: the app uses `SESSION_COOKIE_PATH=/partpilot` so sessions are scoped to the subpath.
