# Deploying the platform

Everything runs on one Linux server with Docker: the database, the API, the
web app, a proxy that handles HTTPS, and a daily database backup. The same
setup serves two purposes:

| | `APP_ENV=staging` | `APP_ENV=production` |
| --- | --- | --- |
| Use | Demo and training server | Live pilot |
| Bank identity check, vetting, bank funding | Test stand-ins in the console | The integration developer's modules |
| One-time codes | Shown on screen | Sent by SMS only |
| Demo data | Can be loaded | Refused |

Never put real people's data on a staging server: anyone who registers there
sees their one-time code on screen, and staff can set identity and vetting
results by hand.

## 1. The server

Hosting must be in Ethiopia (NFR-PRV-02), so use a virtual server in an
Ethiopian data centre. For the pilot, 4 vCPU, 8 GB RAM and 100 GB SSD running
Ubuntu 24.04 LTS is enough. Open ports 22 (SSH), 80 and 443 only.

Point a domain name at the server's public IP address (an `A` record), for
example `tod.eruditeafrica.com`. HTTPS certificates are then issued and
renewed automatically.

Install Docker and Git:

```bash
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y git
```

## 2. Get the code and configure it

```bash
git clone https://github.com/eebbaa82-spec/tod-platform.git
cd tod-platform/deploy
cp .env.example .env
```

Edit `deploy/.env`:

* `APP_ENV`: `staging` or `production`.
* `SITE_ADDRESS`: the domain, e.g. `leseriw.com`.
* `WEB_ORIGIN`: the scheme and host only, e.g. `https://leseriw.com`.
* `BASE_PATH`: leave empty to serve the platform at the root of its own domain
  (leseriw.com),
  or set a sub-path such as `/tod` (see *Serving under a sub-path* below).
* `POSTGRES_PASSWORD`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY`: run
  `openssl rand -hex 32` three times and paste one result into each.
* For real SMS: `SMS_PROVIDER=afromessage` with the AfroMessage token and
  sender name.

Keep a copy of `.env` somewhere safe outside the server. If
`FIELD_ENCRYPTION_KEY` is lost, the encrypted fields in the database cannot
be read again, even from a backup.

### Serving under a sub-path (eruditeafrica.com/tod)

Only needed when the platform shares a domain with another website. On its own
domain (leseriw.com, with the `A` record pointing at the server) leave
`BASE_PATH` empty and skip this section.


Set `BASE_PATH=/tod` to serve every page, the API (`/tod/api`) and uploaded
files under `/tod`; the session cookie is then limited to `/tod` too. The
sub-path is fixed when the web image is built, so rebuild (`up -d --build`)
after changing it. How the traffic reaches this server depends on where the
domain's main website is hosted:

* **The main website is hosted elsewhere** (the usual case). Point
  `SITE_ADDRESS` at a name for this server, e.g. `app.eruditeafrica.com` with
  `WEB_ORIGIN=https://eruditeafrica.com`, and ask whoever runs the main website
  to forward `/tod/` to this server, keeping the path.
  For example, in Apache:

  ```apache
  SSLProxyEngine On
  ProxyPass        /tod/ https://app.eruditeafrica.com/tod/
  ProxyPassReverse /tod/ https://app.eruditeafrica.com/tod/
  ```

  or in nginx:

  ```nginx
  location /tod/ { proxy_pass https://app.eruditeafrica.com; proxy_ssl_server_name on; }
  ```

  Traffic then passes through the main website's host. If that host is
  outside Ethiopia, use this set-up only for demonstrations with test data;
  for the live pilot use a sub-domain such as `tod.eruditeafrica.com` that
  points straight at this server (NFR-PRV-02).
* **The whole domain points at this server.** Set
  `SITE_ADDRESS=eruditeafrica.com`. Visitors to the bare address are sent on
  to `/tod/`; everything outside `/tod` is not served.

## 3. Start it

```bash
docker compose --env-file .env up -d --build
docker compose --env-file .env ps        # all services "Up", api "healthy"
```

The first build takes several minutes. On every start the API applies any new
database migrations and the reference data (service areas, packages and
parameters) before it starts.

Create the first super administrator, using their own phone number:

```bash
docker compose --env-file .env exec api npm run admin:create -- 0911234567 "Full Name"
```

It prints a temporary password. Sign in at the site, scan the code with an
authenticator app (Google Authenticator, Microsoft Authenticator), then
create the other staff accounts from the console.

## 4. Demo data (staging only)

```bash
docker compose --env-file .env exec api npm run db:demo
```

This adds six vetted talents, three verified businesses and five assignments
at different stages: two finished and rated, one delivered and waiting for
the client, one funded and in progress, and one open. Every demo account uses
the password `Demo-2026!`:

| Phone | Who |
| --- | --- |
| 0920000101 | Hanna Tesfaye, graphic design (uses Amharic) |
| 0920000102 | Meron Alemu, social media (uses Amharic) |
| 0920000103 | Dawit Bekele, bookkeeping |
| 0920000104 | Selamawit Girma, data entry (uses Amharic) |
| 0920000105 | Yonas Haile, web and IT |
| 0920000106 | Liya Mekonnen, digital marketing |
| 0920000201 | Tsion Assefa, Abeba Coffee House |
| 0920000202 | Rahel Worku, Piassa Fashion Boutique |
| 0920000203 | Kaleb Tadesse, Merkato Electronics |

Run it on a fresh database; it does nothing if the demo accounts already
exist. The demo users are put in an approved "Demo pilot cohort", so they can
take on work straight away.

## 5. Updating

```bash
cd tod-platform && git pull
cd deploy && docker compose --env-file .env up -d --build
```

## 6. Backups

The `backup` service writes a compressed database dump to `deploy/backups/`
when it starts and then every 24 hours, keeping the last 30. Copy that folder
off the server every day as well, for example with `rsync` to a second
machine in another location. Financial records must be kept for ten years.

Uploaded files are in the `tod_uploads` Docker volume. Back it up too:

```bash
docker run --rm -v tod_uploads:/data -v "$PWD/backups:/out" alpine \
  tar czf /out/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

To restore a dump, replacing the current database:

```bash
docker compose --env-file .env stop api web
docker compose --env-file .env exec db dropdb -U tod tod
docker compose --env-file .env exec db createdb -U tod tod
gunzip -c backups/tod-YYYYMMDD-HHMM.sql.gz | docker compose --env-file .env exec -T db psql -U tod tod
docker compose --env-file .env start api web
```

## 7. Before going live

* The integration developer's partner-bank identity, vetting and escrow modules are in place
  (see [DEVELOPER-INTEGRATION.md](DEVELOPER-INTEGRATION.md)), and
  `APP_ENV=production`.
* `LocalDiskStorage` and `NoScanner` in `apps/api/src/files/storage.ts` are
  replaced with the chosen file store and a malware scanner.
* The `HOLIDAYS` parameter holds this year's Ethiopian public holidays.
* The consortium's published policy texts are in place (FR-SUP-06).
* A restore from backup has been tested once.

### Pilot controls (V-005)

These are on by default and are changed in Console, Parameters:

* `ESCROW_MODE` is `INTERIM` until regulated escrow is in place. Every
  release and refund then needs two **different** finance officers (Console,
  Interim payouts), so create at least two finance officer accounts. Set it
  to `REGULATED` once the partner bank holds the money in escrow.
* `COHORT_CONTROL_ENABLED` is `true`: only members of an approved pilot group
  can pay for work. A platform administrator creates the group and adds
  members by phone number; the super administrator (the Project Director)
  approves it (Console, Pilot groups).
* `GESI_TARGETS` and `GESI_FLAGS` hold the Inception Report targets used by
  the GESI report.

## Useful commands

```bash
docker compose --env-file .env logs -f api     # API log (SMS appear here with SMS_PROVIDER=console)
docker compose --env-file .env restart api
docker compose --env-file .env down            # stop everything (data is kept)
```
