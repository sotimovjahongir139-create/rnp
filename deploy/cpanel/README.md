# cPanel-side production reader/pusher

`production_push.php` runs **on the cPanel host** (`arconper`), reads the factory
production data straight from the local `arconper_arcon` MySQL, and **pushes** it
to odin's backend over HTTPS (`POST /api/ingest/production`).

Why push instead of pull? odin (the analytics VPS, `62.169.31.240`) cannot make
outbound MySQL `:3306` connections — Contabo blocks it. PHP is guaranteed
available on cPanel, so the read happens here and the data travels over HTTPS.

## Files

- `production_push.php` — the reader/pusher (PHP 7/8 CLI; also safe to run via cron).
- `production_push.config.sample.php` — config template. Copy to
  `production_push.config.php` and fill in the real values. **Never commit the real config.**
- `production_push.config.php` — your real config, with secrets (gitignored).

## Install

### 1. Get the two secrets from odin

```bash
ssh odin 'grep INGEST_SECRET ~/rnp/.env'
ssh odin 'grep FACTORY_DB_PASS ~/rnp/factory-access.env'
```

(`FACTORY_DB_PASS` is the password for the read-only `arconper_ro` MySQL user.)

### 2. Place the script + config on cPanel

In cPanel (account `arconper`, portal `clients.ahost.uz` / host `de.ahost.cloud:2083`):

1. **File Manager** → create a directory, e.g. `~/rnp-push/`.
2. Upload `production_push.php` into it.
3. Create `production_push.config.php` from `production_push.config.sample.php`
   and fill in the real `db_pass` (from step 1) and `ingest_secret` (from step 1).

### 3. Backfill once

From the cPanel **Terminal** (or as a one-off cron), backfill ~45 days:

```bash
php ~/rnp-push/production_push.php 45
```

Expect `HTTP 200` followed by `{"ok":true,...}`.

### 4. Daily cron job

Add a daily cPanel **Cron Job** (e.g. `30 6 * * *` for 06:30) that pushes the
last 2 days (small overlap is harmless — the backend upserts):

```bash
php /home/arconper/rnp-push/production_push.php 2 >> /home/arconper/rnp-push/push.log 2>&1
```

If `php` is not on the PATH, use the cPanel PHP CLI path (cPanel shows it, often
`/usr/local/bin/ea-php82`):

```bash
/usr/local/bin/ea-php82 /home/arconper/rnp-push/production_push.php 2 >> /home/arconper/rnp-push/push.log 2>&1
```

The script exits non-zero on any failure, so cron will log failures to `push.log`.

### 5. Verify on odin

```bash
ssh odin "psql -d rnp_analytics -c 'SELECT count(*) FROM production_stats'"
```

and confirm the API returns the six workshops:

```bash
ssh odin "curl -s localhost/api/production/departments"
```

## Before DNS is repointed

`rnp.arcon-group.uz` may not yet point at odin (`62.169.31.240`). Until DNS + TLS
are in place, post directly to the IP over HTTP and let nginx route by Host:

```php
'ingest_url'         => 'http://62.169.31.240/api/ingest/production',
'ingest_host_header' => 'rnp.arcon-group.uz',
'verify_tls'         => false,
```

After DNS + TLS are live, revert to:

```php
'ingest_url'         => 'https://rnp.arcon-group.uz/api/ingest/production',
'ingest_host_header' => null,
'verify_tls'         => true,
```

## How `days_back` works

The CLI arg (default `2`) is `days_back`. For `i` in `1..days_back` the script
reads the day `(today - i)` using the **cPanel box local date** — i.e. yesterday
going backwards. `days_back 2` pushes yesterday and the day before.
