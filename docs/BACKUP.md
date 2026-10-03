# Backups & Restore

TecnoID does not currently ship an in-app backup scheduler — `docs/`
here describes the recommended operational procedure using standard
PostgreSQL tooling plus the `BACKUP_STORAGE_BUCKET` /
`BACKUP_RETENTION_DAYS` variables already reserved in `.env.example`
for whichever cron/CI job you wire this up with.

## 1. What needs backing up

- **PostgreSQL database** — everything: students, attendance,
  payments, audit logs. This is the record of truth and the only
  piece that is financially/legally sensitive (Rule 6: payments and
  invoices are never hard-deleted, so the DB itself is the audit
  trail — losing it loses that guarantee).
- **File storage** (`STORAGE_PROVIDER=s3` bucket, or the
  `STORAGE_LOCAL_DIR` directory in a local/dev deployment) — student
  photos, uploaded documents, exported reports if you persist them.

Nothing else is stateful; application servers can be rebuilt from the
Docker image / git commit at any time.

## 2. Database backup

Daily full dump, retained for `BACKUP_RETENTION_DAYS` (default 30):

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="tecnoid-$(date +%Y%m%d-%H%M).dump"
```

Upload the resulting file to `BACKUP_STORAGE_BUCKET`. If your
PostgreSQL provider offers managed point-in-time recovery (RDS, Neon,
Supabase, etc.), prefer that over a hand-rolled `pg_dump` cron —
managed PITR gives you second-granularity recovery instead of
daily-granularity.

For anything beyond a single small deployment, also enable WAL
archiving / continuous backup on the database provider so you are not
limited to the daily dump's recovery point.

## 3. File storage backup

If using an S3-compatible bucket, enable versioning and a lifecycle
rule that transitions old versions to cold storage after
`BACKUP_RETENTION_DAYS`, rather than deleting them outright — this
protects against accidental overwrite/delete of a student photo or
uploaded document, not just bucket loss.

## 4. Restore procedure

```bash
# 1. Provision a fresh (or scratch) PostgreSQL instance.
# 2. Restore the dump:
pg_restore --clean --if-exists --dbname="$DATABASE_URL" tecnoid-YYYYMMDD-HHMM.dump

# 3. Point the app's DATABASE_URL at the restored instance and run:
npx prisma migrate deploy   # in case the backup predates a later migration

# 4. Smoke-test: log in, open a student profile, confirm a recent
#    payment and a recent attendance record are both present.
```

Restore file storage separately (bucket restore/sync, or re-point
`STORAGE_BUCKET` at the restored bucket) — the database and file
storage are backed up independently and must be restored to
consistent points in time, or you'll see students with a photo
reference (`photoUrl`) that 404s, or vice versa.

## 5. Test your restores

A backup you have never restored is not a backup. At minimum, restore
the latest dump into a scratch database quarterly and run the smoke
test above — this also catches Prisma migration drift early (a
schema change that isn't reflected in a migration file will fail
`prisma migrate deploy` against the restored, pre-migration data).
