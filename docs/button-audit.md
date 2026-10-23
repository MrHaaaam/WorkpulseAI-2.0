# Button audit ? October 22, 2026 (Asia/Manila)

Build passed. Automated suite: **370 passed, 0 failed**. Headless Edge: **72 of 72 scenarios passed**, with no runtime exceptions or unexpected API requests. Source lint: no errors; one existing unused ESLint directive warning in PayrollView.tsx.

Tests used the built React application, temporary browser profiles, synthetic API fixtures, controlled Express handlers, and in-memory records. No live employee records, accounts, emails, or physical devices were changed.

| Area | Coverage |
|---|---|
| Login | Required-field validation, password visibility, CAPTCHA refresh, password recovery, recovery cancellation, OTP login, first-login password replacement |
| Kiosk | Page rendering, recent-attendance loading, scanner-unavailable display, return-to-admin link; server scan validation covered by API tests |
| Admin navigation and controls | Every main screen, unlock/lock, access restrictions, confirmation/cancel flows, maintenance/registration controls, backup confirmation, report downloads, force-clock-out dialog |
| Directory | A?Z ordering, search, role/status filters, table/cards, editor cancellation, archive checkboxes, select all, clear, bulk archive submission |
| Attendance/calendar | Day arrows, range tabs, month arrows, Today, date selection, employee search, all status options, search, manual attendance and idle-day dialogs |
| Leave/payroll/cash/additions | Search/status controls, payroll period arrows, bonus scope persistence, model panels, six archive tables, archive search/status/date filters, pagination, reset, refresh, page/all selection, exclusions, delete cancellation and bulk deletion |
| Archived employees | Row/page/all selection, bulk restore/delete confirmation and cancellation; successful/partial/failed destructive actions tested through controlled handlers |
| Employee portal | All main sections, refresh, profile edit/cancel/save, calendar navigation, leave date picker ranges/months/select/clear/submit, payroll summary/print invocation, cash request submission, histories, notifications, mobile sidebar |
| Offline Records | Admin-only access, employee offline rejection, secret-free cache, prepared admin offline reads, locked date, future/equal-time rejection, duplicate prevention, search/status/date filters, All reset, password-confirmed sync |

## Limits

Physical fingerprint acquisition, accuracy, scanner reconnection, and the installed HID service require testing with the connected reader. The audit verifies kiosk UI behavior without hardware and API validation with controlled matcher results.

Print-button invocation and report-download handlers passed. Actual printer output, delivery to a real inbox, and native backup destination selection were not physically verified.

The inventory contains **350 JSX control declarations**, including conditional controls and repeated templates. The 72 browser scenarios exercise representative states and workflows; the inventory is not a claim that each possible rendered control or state was individually clicked. API and handler tests supply additional coverage for data-changing and error paths.

## Re-run

- `npm test` ? automated tests and controlled API scenarios.
- `npm run test:buttons` ? build, regenerate API fixtures, and run browser scenarios (requires local Edge).
- `node scripts/offline-browser-smoke.mjs` ? offline UI checks (requires local Edge).
- `npm run test:controls` ? regenerate static control inventory.

Detailed browser results: [full-button-audit-results.json](full-button-audit-results.json).
Control inventory: [button-audit-inventory.json](button-audit-inventory.json).


Archive deletion removes entries from the requesting portal's archive view. Employee and admin archive deletions are independent. Source leave, payroll, additions and repayment records remain intact for calculations; deletion metadata is included in database backups. Automated tests verify privacy, cutoff eligibility, filter-wide selection across pages, deselection exclusions, and unchanged cash balances.
