# WorkPulse offline support

WorkPulse has a local IndexedDB outbox and a production service worker. This is
limited offline capture and cached viewing, not a local replacement for MongoDB.

## Supported actions

| Action | During an outage | After reconnecting |
| --- | --- | --- |
| Admin manual attendance | Open **Offline records**, capture actual times and save locally | Admin reviews and enters their password to sync |
| Attendance correction with an already loaded preview | Save locally with the preview version | Fresh password and server checks; stale previews need review |
| Employee leave request | Saved locally, pending sync | Automatically submitted after session validation |
| Employee cash advance request | Saved locally, pending sync; no debt created | Automatically submitted after current-period and limit checks |
| Employee workspace, visited calendar months, attendance and notifications | Recent cached copies, explicitly marked offline | Refresh restores current server values |
| Payroll payment/undo, leave and cash approvals, disbursement, profile changes, account controls, fingerprint matching | Online only | Normal existing workflows |

The normal admin manual-attendance dialog offers a link to offline capture during
an outage. Attendance capture can accept a typed employee ID if the saved roster
is unavailable. The server verifies that ID before accepting the record.

## Preparing a device

1. Deploy the backend before the frontend: the frontend uses `/api/offline/sync`
   for idempotent attendance corrections and employee leave/cash submissions.
2. Open the deployed website online and sign in. Admin rosters and employee
   workspaces are prepared after login. Other permitted pages cache when visited.
3. Open **Offline records** and check **Offline page cache ready**. Production
   caching requires HTTPS or localhost. Vite development mode does not install
   the page service worker; keep the development tab open during an outage.
4. Use the same browser, origin and device. A new device, a never-visited page,
   private browsing restrictions, expired session or deleted browser storage
   cannot promise offline access. The existing five-hour session limit is kept.

## Outbox and synchronization

- States: **Pending sync**, **Needs review**, **Synced**. Local captures are never
  represented as approved requests, paid payroll, confirmed debt or server-saved
  attendance before acceptance.
- Employee requests retry after the browser's online event and every 30 seconds
  while the page is visible. Attendance sync requires a current admin password;
  no password, session token, CSRF token or fingerprint sample is stored in the
  outbox. A fresh authenticated session must match the outbox account.
- Stable operation IDs and payload hashes bind a retry to the original action.
  MongoDB stores the business changes and the operation receipt together in a
  transaction. Lost responses or concurrent retries cannot apply the same action
  twice. Receipts are included in backups and have no TTL.
- Attendance checks active employee, chronology, future times, sessions, adjacent
  overlaps, approved leave, preview version and settled/paid/carried/reset payroll.
  An unpreviewed new capture can fill an empty automatically-absent day, but cannot
  replace existing time records. Payroll recalculation and employee notifications
  commit together with attendance. Admin edit notifications derive from history.
- Leave checks current work schedule, date validity, passed dates, reason, count
  and overlap. Cash requests check current payroll period, amount, agreement,
  open requests, period claims and previous disbursement. Requests do not create
  debt; existing online approval and disbursement steps remain required.
- Validation conflicts are retained for review. Correct them through the normal
  online workflow or discard the rejected local request and submit reviewed data.
  Open local attendance can be completed with a local time-out before syncing.
- Network/server failures retain the queue. Storage/quota failure reports an
  error, never successful local saving. Unsupported mutations show an online-only
  error. Queue size is capped at 200 unsynced records per account; cached reads
  are limited to 150 recent entries per account and expire for offline use after
  seven days. A synced local copy can be removed without deleting the server record.
- Reads and queues are account-scoped. Logout clears that account's read cache;
  queued records remain for the same account after signing in again. A local
  record is only stored on its browser/device until sync: clearing browser data,
  losing the computer or changing domains can lose unsynced work. Use a trusted
  attendance station and retain a verified paper backup for device failure.

## Verification

Run `node --test backend/src/*.test.js` and `npm.cmd run build`.
On Windows with Edge, run `node scripts/offline-browser-smoke.mjs` after building.
Set `WORKPULSE_TEST_BROWSER` to another Chromium executable if needed. This uses
an isolated temporary profile, mocked API and real IndexedDB/service worker; it
does not access production data or the user's normal browser profile.

The browser smoke test checks offline reload, cached data, queue persistence,
account isolation, storage failures, blocked payments, reconnect auto sync and a
server-save/lost-response retry. Backend tests verify transaction rollback,
idempotent attendance/requests, roles, paid payroll, leave and cash conflicts.

For a defense: “WorkPulse remains cloud-based. During an outage, supported actions
are stored locally as pending records. When connectivity returns, the server
validates them before applying changes. Financial approvals and fingerprint
identification remain online-only.”
