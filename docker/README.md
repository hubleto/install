# Docker deployment

Requires Docker Engine with the Docker Compose plugin (Compose v2.20+), or Docker
Desktop. From a checkout of this repository:

```sh
docker compose up -d
docker compose logs -f init
```

Docker Compose automatically reads the root [`docker-compose.yaml`](../docker-compose.yaml).

The first startup builds the application images and initializes an empty database.
Wait for `Hubleto installation completed.`, then open http://localhost:8080 and sign
in as `admin@example.com`. The installer prints the generated administrator password
in the `init` logs. Set `HUBLETO_ADMIN_PASSWORD` before first startup to choose it.
Treat the init logs as sensitive because the upstream installer prints credentials.
Save the generated password: recreating the init container removes its previous logs.

Subsequent starts reuse the installation. An `init` container in `Exited (0)` state
is normal. Inspect the stack with `docker compose ps -a`.

## Services and storage

| Service | Responsibility |
| --- | --- |
| `web` | Nginx serves assets and forwards application requests to PHP-FPM. |
| `app` | PHP 8.4 FPM runs Hubleto. |
| `db` | MariaDB 11.4 stores application data. Its port is internal only. |
| `init` | Initializes an empty database once, before application startup. |
| `scheduler` | Runs Hubleto's scheduled jobs once per minute. |

The app, init, and scheduler services use the same PHP image. The web image contains
Nginx and static assets. Composer runs during the image build. The compiled frontend
ships in `hubleto/assets`, so Node and npm are unnecessary for this deployment.

| Named volume | Contents |
| --- | --- |
| `db_data` | MariaDB database files |
| `app_data` | Installation config, completion marker, secure files, temporary files |
| `uploads` | Uploaded files |
| `logs` | Hubleto application and scheduled job logs |

Application source and dependencies are baked into images. Host source directories
are not mounted over them. PHP processes run as `www-data`. Only Nginx publishes a
host port. Its configuration exposes the front controller, packaged static assets,
and uploads; configuration, vendor PHP, logs, and installer scripts are not served.

## Configuration and server deployment

Each service in [`docker-compose.yaml`](../docker-compose.yaml) declares its own
settings explicitly. Edit the defaults in the `${VARIABLE:-default}` expressions
before first startup. Keep the database values under `db.environment` and
`init.environment` consistent. The published address and port are configured
under `web.ports`.

For example, set a default administrator password under `init.environment`:

```yaml
HUBLETO_ADMIN_PASSWORD: ${HUBLETO_ADMIN_PASSWORD:-your-password}
```

Keep `${HUBLETO_ADMIN_PASSWORD:-}` to generate a random password instead.
Shell environment variables and an optional root `.env` file can also override
these defaults. For example, an optional `.env` can contain:

```dotenv
HUBLETO_URL=https://crm.example.com
DB_PASSWORD=your-database-password
HUBLETO_ADMIN_EMAIL=owner@example.com
HUBLETO_ADMIN_PASSWORD=your-admin-password
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `HUBLETO_PORT` | `8080` | Published HTTP port |
| `HUBLETO_BIND` | `127.0.0.1` | Host address to bind |
| `HUBLETO_URL` | `http://localhost:8080` | Public URL, without a subpath |
| `DB_DATABASE` | `hubleto` | Database name (letters, digits, underscores) |
| `DB_USERNAME` | `hubleto` | Database user scoped to this database |
| `DB_PASSWORD` | `hubleto` | Database password |
| `HUBLETO_ACCOUNT_NAME` | `Hubleto` | Account/company name |
| `HUBLETO_ADMIN_EMAIL` | `admin@example.com` | Initial administrator login |
| `HUBLETO_ADMIN_PASSWORD` | random | Initial administrator password |
| `HUBLETO_PACKAGES` | `crm,marketing,sales,finance,help,maintenance` | Initial app packages |
| `TZ` | `UTC` | Container timezone |

The defaults provide a local installation bound to loopback. For a server, set a
strong `DB_PASSWORD` and the real `HUBLETO_URL` before first startup. Put a TLS
reverse proxy in front of the HTTP port, for example with
`HUBLETO_URL=https://crm.example.com`. If clients must connect directly to this
HTTP port, set `HUBLETO_BIND=0.0.0.0` and restrict access appropriately.

The URL must match the address users enter, including a custom port. Changing
`HUBLETO_PORT` also requires setting `HUBLETO_URL`.

Database credentials, public URL, and account settings are persisted during first
initialization. Editing the Compose settings or `.env` later does not rewrite an
existing installation or reset administrator credentials. Change users/passwords through Hubleto. To move
the public URL, back up and edit `/var/lib/hubleto/ConfigEnv.php` in `app_data`,
updating all URL values, then restart `app` and `scheduler`.

## Stop, restart, and update

```sh
docker compose down
docker compose up -d
```

`down` keeps named volumes. **`docker compose down -v` deletes the installation,
including the database and uploaded files.** Use it only for an intentional reset
of a disposable installation.

To update, take a backup first, update this checkout to the desired revision, and
rebuild:

```sh
docker compose build --pull --no-cache
docker compose up -d
docker compose exec app php hubleto migrate
```

Initialization is skipped for an existing installation; updates never rerun
`hubleto init`. Review migration output and the release's upgrade instructions.
Keep the previous images and backups available for rollback. A fresh build uses
`composer.lock` when present; this template currently ignores that file, so without
one Composer resolves dependencies again. Retain tested images for reproducible
client rollouts. The images are built locally; this repository does not require
an image registry or publish images automatically.

## Backups

Back up both the database and application volumes together. For a consistent
backup, stop writers first:

```sh
mkdir -p backups
docker compose stop web app scheduler
docker compose exec -T db sh -c 'exec mariadb-dump --single-transaction --routines --triggers -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' > backups/database.sql
docker compose run --rm --no-deps -T app tar -C / -czf - var/lib/hubleto var/www/hubleto/upload var/www/hubleto/log > backups/files.tar.gz
docker compose start app scheduler web
```

Store backups securely; configuration contains database credentials and secure
files may contain encryption keys. To restore into a new stack, first build the
images and start only `db`; do not start `init`. Wait for the DB health check, import
the dump, and restore the files using the app image:

```sh
docker compose build
docker compose up -d db
# Wait until docker compose ps reports db as healthy.
docker compose exec -T db sh -c 'exec mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' < backups/database.sql
docker compose run --rm --no-deps -T app tar -C / -xzf - < backups/files.tar.gz
docker compose up -d
```

Use the original database settings for the restored stack. Restoring `app_data`
includes the installation marker, so the initializer recognizes the restored
database and does not recreate it.

## Failed initialization

Inspect `docker compose logs init db`. The initializer refuses to install over a
nonempty database, or retry an installation that failed after writing its
`initializing` marker. This protects against the upstream installer's database
drop/create operation. Correct the cause before retrying.

For a disposable first installation with no data to keep, reset the stack with
`docker compose down -v` and run `docker compose up -d` again. For an existing
installation, restore the matching database and application-volume backup. Do not
remove the installation markers to force a reinstall over customer data.

## Docker support files

`docker/init.php` supplies unattended installation settings and the generated
password, persists configuration, and prevents the destructive upstream installer
from running over existing data. It invokes the installer directly because the
upstream CLI can exit successfully after an installation error.

`docker/healthcheck.php` checks installation state, database connectivity, and
PHP-FPM readiness, so Compose can start dependent services in order.

`docker/ConfigEnv.php` loads the installation configuration from its persistent
volume. `nginx.conf` and `php.ini` configure the separate server processes.

Scheduled jobs use Hubleto's generated `cron.php` directly. The small loop in the
Compose service runs it in a fresh process on each minute boundary.
