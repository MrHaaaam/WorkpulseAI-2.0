# Recover deleted business data without replacing live data

Run `backend/recover-backup.js` from the backend folder. This operation restores missing records from a WorkPulse version 2 JSON backup into an existing database. It never updates or deletes existing records. It does not switch the app to a different database or create a second database.

## Preview

```powershell
node recover-backup.js "C:\Users\EMMANUEL DEOCARES\Desktop\workpulse-backup-2026-10-12.json" --db=workpulseai --plan=recovery-preview.json
```

This is read-only for MongoDB. Open `recovery-preview.json` and inspect rows with action `restore`. Rows marked `preserve-live` have an existing identity or business key and will remain unchanged, even when the backup differs. The preview contains identities and hashes, not passwords or fingerprint samples.

Missing does not prove accidental deletion. Review the scope before applying. Narrow the preview with `--employees=ID1,ID2` for employee profiles and linked records, or `--collections=attendance,payroll_requests` for selected collections. Missing employee and payroll dependencies block application. Global settings, administrator accounts, tokens and temporary verifications are outside recovery scope. Audit/offline receipts already retained by employee deletion are not rewritten.

## Apply a reviewed preview

```powershell
node recover-backup.js "C:\Users\EMMANUEL DEOCARES\Desktop\workpulse-backup-2026-10-12.json" --db=workpulseai --plan=recovery-preview.json --apply
```

Apply uses the scope saved in the preview. It writes a `pre-recovery-workpulseai-<timestamp>.json` current-data safety backup locally before inserting. It checks the preview again inside a snapshot transaction and refuses if relevant live/source records changed. An insert failure rolls back all recovery inserts. MongoDB replica-set/transaction support is required; there is no nontransactional fallback. Very large recoveries can exceed transaction time or storage limits and will fail rather than silently apply part of the dataset.

Pause attendance/payment/profile changes during recovery and review financial relationships before applying. This missing-record operation cannot reverse incorrect edits to records that still exist. Existing live records always win. A recovered employee keeps their backed-up status and account credentials. If they were archived in the backup, use the existing archived-employee Restore action afterward. Biometric records require the original encryption key/configuration.

After successful recovery, refresh the live app. Its existing connection still points to the same live database. No frontend or backend deployment is required to run this local administrative script against the configured cluster.

## Validation

Fourteen mocked backup/recovery tests cover read-only preview, selective scope, dependency failures, logical-key collisions, preservation of newer data, stale preview, wrong database, repeat preview, bulk records, and rollback. `scripts/recovery-mongo-smoke.mjs` uses a separate local MongoDB replica set with synthetic data to verify actual 1,000-record transactional recovery and duplicate-key rollback. It never uses the production connection. Syntax and targeted lint checks passed.
