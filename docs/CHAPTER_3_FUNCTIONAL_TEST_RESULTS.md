# WorkPulse functional verification results

Verification date: October 11, 2026 (Asia/Manila).

The local backend suite completed with 175 passing checks, zero failures, and zero skipped checks. The production frontend build and isolated Microsoft Edge browser checks also completed successfully. The results below describe outcomes using controlled test records. Backend checks use simulated database records; browser checks use actual IndexedDB and service worker functionality with simulated server responses. These are software verification results, not participant survey responses or physical fingerprint measurements. They do not establish live Vercel/Render behavior.

## Results for Chapter 3

| No. | Test scenario | Expected result | Actual result | Outcome |
| --- | --- | --- | --- | --- |
| 1 | Administrator enters a missed attendance session, 9:00 AM–5:00 PM | Save valid attendance and notify the affected employee | Attendance saved; administrator, reason and history retained; employee notification created | Passed |
| 2 | Administrator enters a future attendance time | Reject the change | Validation rejected the future time | Passed |
| 3 | Administrator enters overlapping attendance sessions | Reject the change | Overlapping sessions were rejected | Passed |
| 4 | Administrator attempts to change attendance covered by paid payroll | Preserve the existing attendance | Correction rejected; existing attendance remained unchanged | Passed |
| 5 | Another update changes attendance before a correction is submitted | Reject the outdated correction | Stale-version correction rejected | Passed |
| 6 | An employee attempts to use administrator correction functions | Deny the request | Role and administrator-password requirements blocked unauthorized correction | Passed |
| 7 | Recorded clock-in and clock-out events generate notifications | Notify administrators and only the affected employee | Both event notifications generated; employee notices targeted the employee in the recorded event | Passed |
| 8 | A pending leave request contains October 8 and later dates; test reference date is October 10 | Show October 8 as passed while preserving unresolved current/future dates | October 8 displayed as passed; October 10, 12 and 14 remained pending | Passed |
| 9 | A request has been approved but cash has not been given | Do not create outstanding cash advance debt | No debt created before confirmed disbursement | Passed |
| 10 | An employee owes ₱1,000 and has only ₱150 available for repayment | Deduct no more than available earnings | ₱150 recorded upon settlement; outstanding balance became ₱850 | Passed |
| 11 | Three eligible earnings periods are combined for an employee owing ₱1,000 | Include the ₱200 installment for each eligible period | Proposed repayment totaled ₱600; debt stayed ₱1,000 before settlement and became ₱400 after settlement | Passed |
| 12 | Two periods each earn ₱800 with a ₱200 installment per period | Include both periods and both installments | Total earnings ₱1,600; repayment ₱400; resulting payout ₱1,200 | Passed |
| 13 | A paid statement includes carried source statements | Count the repayment once | Carried source statements did not produce duplicate repayment deductions | Passed |
| 14 | Manager and legacy supervisor records coexist | Use the combined classification and shared rate | Both normalized to Manager / Supervisor; both used the configured manager rate | Passed |
| 15 | A legacy supervisor account opens the portal and employee directory | Display the combined role | Portal showed Manager / Supervisor; directory offered Regular, Extra and Manager / Supervisor | Passed |
| 16 | Administrator opens System Settings | Provide one management rate field | One Manager / Supervisor rate field displayed; separate supervisor field absent | Passed |
| 17 | Employee submits a supported request during an outage | Retain the request locally without claiming server acceptance | Request persisted in IndexedDB as Pending; local-save toast displayed | Passed |
| 18 | A prepared application is reopened without connectivity | Load cached application resources | Application reloaded using service worker cache | Passed |
| 19 | Connectivity returns for queued employee requests | Submit requests and update their status | Automatic synchronization completed against the simulated server | Passed |
| 20 | A server response is lost and the same operation is retried | Prevent duplicate processing | Original operation identifier reused; no additional business mutation created | Passed |
| 21 | Administrator captures attendance offline | Retain locally and require password-confirmed synchronization | Attendance saved locally; automatic synchronization withheld; password-confirmed synchronization completed | Passed |
| 22 | Browser storage fails | Report the failure without falsely claiming a successful local save | Storage error was surfaced | Passed |
| 23 | A different account signs in on the same browser | Prevent access to the prior account's cached records | Account-isolation checks passed | Passed |
| 24 | User attempts an unsupported financial action offline | Block the action | Unsupported action blocked; no successful financial transaction fabricated | Passed |
| 25 | An offline operation fails while saving its receipt, updating payroll, or creating a notification | Prevent partial business changes | Transaction rollback preserved the pre-operation records | Passed |

The table groups selected behaviors from the larger suite; its 25 rows are not 25 independently administered participant trials. Simulated failures verify the handling implemented in the application, not every possible infrastructure failure.

## Scope requiring additional evidence

- Physical fingerprint identification accuracy, failed captures, and processing times require scanner trials.
- Live deployed application and outage behavior require separate Vercel/Render checks.
- Organizational acceptance or approval of fallback policies requires the owner's confirmation.
- The user's previously computed SUS score of **80.83** is retained unchanged. It was not recalculated by this verification.

## Evidence

- Backend run: `tools/chapter-test-results.log` — 175 passed, 0 failed, 0 skipped.
- Browser run: `tools/chapter-browser-results.log` — completed successfully.
- Frontend build: `tools/chapter-build-results.log` — completed successfully.
- Attendance: `backend/src/attendance-corrections.test.js`.
- Cash advances: `backend/src/cash-advances.test.js` and `backend/src/cash-advance-requests.test.js`.
- Payroll: `backend/src/payroll-preparation.test.js`.
- Notifications and access: `backend/src/employee-notifications.test.js` and `backend/src/employee-updates-routes.test.js`.
- Calendar: `backend/src/calendar-leave.test.js`.
- Roles: `backend/src/employee-roles.test.js`.
- Offline validation: `backend/src/offline-operations.test.js`.
- Browser checks: `scripts/offline-browser-smoke.mjs`.
