# Local backup and restore

An administrator uses **Admin Controls → Database Backup → Choose & Save** to save a version 2 JSON backup in a restricted folder on the local computer. Keep a second copy on an approved external drive. Restrict access to both copies: the file contains payroll, account password hashes, audit records, and encrypted biometric templates. The biometric encryption key must also be preserved securely; if the application uses its MongoDB URI as the encryption key, changing the URI can make restored templates unreadable.

The backup includes the durable application collections and preserves MongoDB IDs and dates. It excludes temporary sessions, OTPs, and captchas. Version 1 downloads from the old button are incomplete and are not accepted by the restore command. Download a fresh version 2 backup before relying on this procedure.

## Restore into a new database

1. Stop writes to the source system or enable maintenance mode, then make a fresh backup. Record the current `BIOMETRIC_ENCRYPTION_KEY` securely.
2. On the computer running the backend, place the JSON file in a restricted local folder. Set `MONGODB_URI` in `backend/.env` to a MongoDB server you control. Choose a **new, empty database name**.
3. From `backend`, preview the backup:

   ```powershell
   node restore-backup.js "C:\path\to\workpulse-backup.json" --db=workpulse_recovery
   ```

4. Check the printed counts and date. Then run the same command with `--apply`:

   ```powershell
   node restore-backup.js "C:\path\to\workpulse-backup.json" --db=workpulse_recovery --apply
   ```

5. Point a test backend at `workpulse_recovery` with the original biometric encryption key. Starting the backend creates its indexes. Sign in and verify sample employee, attendance, leave, payroll, and biometric records before using this database for production. Sessions and one-time codes are not restored, so users must sign in again.

The restore command refuses to write if **any collection in the destination contains records**. It never deletes an existing database. If a restore fails partway through, use another new empty database for the next attempt. A live backup is collected across multiple queries, so maintenance mode or otherwise pausing writes is needed for a consistent snapshot.

## Excel reports

The **Excel Reports** buttons in Admin Controls download CSV files for employees, attendance, leave, and payroll. Excel opens these files directly. They contain selected readable columns and are not recovery backups. Attendance and payroll pages also have their own filtered CSV exports.
