# Deploying PartPilot to a VPS

PartPilot ships as three containers wired together by Docker Compose:

| Service | What it is | Ports |
|--------|-----------|-------|
| `db`   | MySQL 8 (persistent volume) | internal only |
| `api`  | Node API (self-contained bundle) | internal `3001` |
| `web`  | Caddy — serves the app + proxies `/api`, **automatic HTTPS** | `80`, `443` |

On first boot the API **creates its own tables and seeds the login accounts** — no manual SQL needed.

---

## 1. Prerequisites

- A VPS (Ubuntu 22.04+ recommended) with root/sudo.
- **Docker + Compose plugin**:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Open ports **80** and **443** in the VPS firewall.
- *(For HTTPS)* a domain you control, e.g. `partpilot.example.com`.

## 2. Point your domain at the VPS (for HTTPS)

Create a DNS **A record**: `partpilot.example.com → <your VPS IP>`.
Skip this if you only want to test over HTTP by IP.

## 3. Get the code onto the VPS

```bash
git clone <your-repo-url> partpilot && cd partpilot
# ...or copy the folder up with scp/rsync.
```

## 4. Configure

```bash
cp deploy/.env.example .env
nano .env
```
Set at minimum:
- `SITE_ADDRESS` → your domain (auto-HTTPS) **or** `:80` to test by IP first.
- `MYSQL_ROOT_PASSWORD` → a strong, URL-safe password.
- `SESSION_SECRET` → `openssl rand -hex 32`.
- *(optional)* `GROQ_API_KEY` for AI chat/narratives (free at console.groq.com/keys). Everything else works without it.

## 5. Launch

```bash
docker compose up -d --build
```
First build takes a few minutes. Watch it come up:
```bash
docker compose logs -f api      # look for "Database schema ready" then "Server listening"
```

Open **https://partpilot.example.com** (or `http://<VPS-IP>`).

**Default logins (change immediately):**
| User | Password | Role |
|------|----------|------|
| master  | master123  | full control + user management |
| creator | creator123 | build & edit parts |
| viewer  | viewer123  | read-only |

Sign in as `master` → **Users** page → reset passwords / add real users / delete the demo accounts.

---

## 6. Load your part-number data

A fresh database starts empty (only the seeded users). Two ways to populate it:

**A) Bring your existing data** (recommended if you already have parts locally). On your machine, dump the two data tables and load them into the VPS:
```bash
# local
mysqldump -u root -p part_number_ai part_numbers segment_values > partpilot-data.sql
scp partpilot-data.sql user@vps:/root/partpilot/

# on the VPS
docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" partpilot' < partpilot-data.sql
```

**B) Start from the segment template.** You need at least the `segment_values` catalog for the builder to work; import it with the template importer from a machine that has the repo + `DATABASE_URL` set, or load a `segment_values` dump as in (A).

> The builder needs the `segment_values` catalog to offer options — make sure that table is populated.

---

## Deploying behind CloudPanel / Hostinger (or any existing web server)

If your VPS already runs CloudPanel, it owns ports 80/443 and its own MySQL. **You do not need to create a database in CloudPanel** — PartPilot runs its own MySQL inside Docker, isolated from your other sites (e.g. `esco`). Put PartPilot behind CloudPanel as a reverse-proxied site:

1. **Install Docker** on the VPS (over SSH):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. **Get the code + configure**:
   ```bash
   git clone <your-repo-url> partpilot && cd partpilot
   cp deploy/.env.example .env
   nano .env      # set MYSQL_ROOT_PASSWORD, SESSION_SECRET (openssl rand -hex 32), GROQ_API_KEY
   ```
   `SITE_ADDRESS` is ignored in this mode (CloudPanel does TLS).
3. **Start the stack** — the web app is published only on `127.0.0.1:8080`:
   ```bash
   docker compose -f docker-compose.proxied.yml up -d --build
   docker compose -f docker-compose.proxied.yml logs -f api   # wait for "Server listening"
   ```
4. **Point a subdomain at the VPS**: add a DNS **A record**, e.g. `partpilot.ikiousa.tech → <your VPS IP>`.
5. **Create the CloudPanel reverse-proxy site**: CloudPanel → **Sites → Add Site → Create Reverse Proxy**.
   - Domain: `partpilot.ikiousa.tech`
   - Reverse Proxy URL: `http://127.0.0.1:8080`
6. **Enable SSL**: open the new site → **SSL/TLS → Let's Encrypt → Install**. CloudPanel issues and renews the certificate.

Open **https://partpilot.ikiousa.tech** and sign in (master / master123 — change it immediately).

To update later:
```bash
cd partpilot && git pull && docker compose -f docker-compose.proxied.yml up -d --build
```

> Prefer to reuse CloudPanel's MySQL instead of the Docker one? You can create a database from the command line even if the UI won't let you: SSH in, run `sudo mysql`, then `CREATE DATABASE partpilot; CREATE USER 'partpilot'@'%' IDENTIFIED BY '...'; GRANT ALL ON partpilot.* TO 'partpilot'@'%';`. Then drop the `db` service and set `DATABASE_URL` to `mysql://partpilot:...@host.docker.internal:3306/partpilot`. The bundled-MySQL route above is simpler and fully isolated, so it's recommended.

---

## Deploying at a **subpath** behind CloudPanel (e.g. `https://ikiousa.tech/partpilot/login`)

Use this when you want PartPilot on a **path** of a domain you already serve — `ikiousa.tech/partpilot/` — instead of its own subdomain. The stack brings its **own MySQL** (isolated in a Docker volume) plus the API and a subpath-aware Caddy, all bound to `127.0.0.1:8080`; CloudPanel's nginx forwards the `/partpilot` path to it and terminates HTTPS.

Everything is driven by one variable, `BASE_PATH` (default `/partpilot`): it bakes the SPA's asset URLs + router basename + API request prefix, scopes the session cookie, and configures Caddy's routing — so the three layers stay in sync.

1. **Install Docker** on the VPS (over SSH), if not already:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. **Get the code + configure**:
   ```bash
   git clone <your-repo-url> partpilot && cd partpilot
   cp deploy/.env.subpath.example .env
   nano .env      # set MYSQL_ROOT_PASSWORD, SESSION_SECRET (openssl rand -hex 32), GROQ_API_KEY
                  # keep BASE_PATH=/partpilot (or change it — it must match the CloudPanel location below)
   ```
3. **Start the stack** — published only on `127.0.0.1:8080`:
   ```bash
   docker compose -f docker-compose.subpath.yml up -d --build
   docker compose -f docker-compose.subpath.yml logs -f api   # wait for "Database schema ready" then "Server listening"
   ```
4. **Add the reverse-proxy location in CloudPanel.** Open the CloudPanel site that serves `ikiousa.tech` → **Vhost** tab, and add this `location` block inside the `server { … }` block (adjust `/partpilot` if you changed `BASE_PATH`), then **Save** (CloudPanel reloads nginx):
   ```nginx
   location /partpilot {
       proxy_pass http://127.0.0.1:8080;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }
   ```
   > No trailing slash on either `location /partpilot` or `proxy_pass …:8080` — nginx must forward the full `/partpilot/...` URI unchanged; the app's Caddy strips the prefix internally. If `ikiousa.tech` isn't a CloudPanel site yet, create it first (any PHP/static/reverse-proxy site with SSL enabled), then add this block.

Open **https://ikiousa.tech/partpilot/login** and sign in (master / master123 — change it immediately).

To update later:
```bash
cd partpilot && git pull && docker compose -f docker-compose.subpath.yml up -d --build
```

Operating commands are the same as below — just add `-f docker-compose.subpath.yml` to each `docker compose` call.

## Operating it

```bash
docker compose ps                 # status
docker compose logs -f api        # API logs
docker compose restart api        # restart after an .env change
docker compose down               # stop (data volumes are kept)
docker compose up -d --build      # update after `git pull`
```

**Backups** — the database lives in the `db_data` volume:
```bash
docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" partpilot' > backup-$(date +%F).sql
```

**HTTPS** is automatic once `SITE_ADDRESS` is a real domain pointed at the box — Caddy fetches and renews Let's Encrypt certs (stored in the `caddy_data` volume). No certbot needed.

---

## Security checklist

- [ ] `SESSION_SECRET` is a long random string (not the default).
- [ ] `MYSQL_ROOT_PASSWORD` changed from the example.
- [ ] Demo accounts (`master`/`creator`/`viewer`) have new passwords or are replaced.
- [ ] Firewall allows only 80/443 (and SSH); MySQL is **not** exposed to the internet (it isn't, by default).
- [ ] You're on HTTPS (real domain in `SITE_ADDRESS`).

## Troubleshooting

- **`api` restarts / "Database migration failed"** — the DB wasn't ready; it retries for ~40s. Check `docker compose logs db`. Confirm `MYSQL_ROOT_PASSWORD` matches in `DATABASE_URL` (it's derived from the same var).
- **HTTPS won't issue a cert** — DNS must resolve to the VPS and ports 80/443 must be open before Caddy can validate. Check `docker compose logs web`.
- **Login works but pages are empty** — you haven't loaded `segment_values` / `part_numbers` yet (see step 6).
- **AI chat says "not configured"** — add `GROQ_API_KEY` to `.env` and `docker compose up -d` to recreate the `api` container.
