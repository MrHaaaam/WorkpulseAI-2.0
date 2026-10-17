# WorkPulse feature audit — October 17, 2026

## Verification scope

Reviewed login, administrator pages, employee portal pages, and feedback after user actions. Ran the existing backend, navigation, leave review, Excel export, and session-cache tests, plus 13 new UI action-handler regression tests. The new tests execute application handlers with controlled React state and API responses; they are not browser automation.

| Area | Checks |
| --- | --- |
| Sign-in and account access | CAPTCHA, OTP, retry limits, password recovery, first-login password changes, role restrictions, session expiry, sidebar history, logout, kiosk routing |
| Attendance and calendars | Time-in/out, multiple sessions, manual capture, corrections, conflicts, leave restrictions, idle days, automatic and forced clock-out, date-filter cache isolation |
| Employee management | Input policies, email verification, account access, archive restoration, enrollment error messages, employee notifications |
| Leave | Submission and cancellation, selected dates, partial approval, past dates, bulk decisions, undo, employee status labels |
| Payroll and cash advances | Preparation, paid-record protection, carry-forward, bonuses, quarterly additions, payment/undo rules, requests, terms acceptance, cancellation, disbursement, repayments |
| Insights and fingerprint tester | Attendance flags and forecasts, reviewed accuracy, pending-trial exclusion, assessment ownership and duplicate protection, scan-first testing |
| Administration and exports | Settings validation and loading safeguards, backup format/recovery rules, readable Excel workbooks, export formatting |
| Employee portal feedback | Refresh success/failure, initial-load recovery, cash-advance actions, contact updates, logout failure, notification read status |

## Fixes made

- Added missing cash-advance submission, acceptance, cancellation, and failure toasts in the employee portal.
- Added feedback for manual refreshes, notification read actions, password-reset verification, allowance changes, bonus failures, and fingerprint assessments.
- Kept inline errors for persistent failures; ordinary background refreshes do not generate repeated success toasts.
- Distinguished a successful save followed by an unsuccessful refresh from a failed save.
- Kept the employee session active when server logout fails, with a retryable error toast.
- Added employee workspace load errors and retry controls, and protected refreshed records against older responses.
- Corrected the employee leave label: rejected leave displays “Rejected”; payroll can display “Payment on hold”.
- Preserved kiosk routing for direct sign-in and prevented another OTP submission during successful navigation.
- Caught administrator block-access and account-restoration network failures; preserved server error details and reset busy state.
- Made administrator data-loading failures visible, preserved cached records, and blocked settings edits/saves while settings are loading or unavailable.
- Preserved the server's restored employee access state rather than assuming the employee is unblocked.

## Results and repeat commands

262 automated tests passed, including the 13 new action-handler regression tests.

```powershell
node --experimental-strip-types --test backend/src/*.test.js shared/*.test.js scripts/*.test.cjs scripts/page-cache.test.mjs
npm.cmd run lint
npm.cmd run build
```

## Live checks still required

No live employee data, account permissions, payroll payments, or leave decisions were changed for this audit. Authentication HTTP tests use controlled records and mocked mail.

Physical fingerprint capture/matching on the installed reader, real email delivery, browser print/download dialogs, responsive layouts, and the hosted deployment still require live browser/device verification. Passing these automated tests does not establish that those integrations work in every deployment.
