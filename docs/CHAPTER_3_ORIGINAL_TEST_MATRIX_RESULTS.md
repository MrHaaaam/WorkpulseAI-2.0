# Verification of the original Chapter 3 test matrix

Verification date: October 12, 2026 (Asia/Manila).

These are the ten cases from page 8 of WorkPulse_Chapter_3_Revised.pdf. Status means passed in controlled local verification, not passed on the deployed website. Backend records are simulated. Browser checks use isolated Edge, actual IndexedDB and service worker behavior, and simulated API responses. No live employee records were changed.

| No. | Test scenario | Expected result | Actual result | Status |
| --- | --- | --- | --- | --- |
| 1 | Future attendance time | Reject future-dated attendance | Future times rejected by attendance validation; browser rejected a future capture without saving it | Passed |
| 2 | Overlapping sessions | Prevent overlapping work sessions | Overlapping sessions rejected and existing attendance preserved | Passed |
| 3 | Settled payroll attendance edit | Reject direct changes and preserve history | Changes to attendance covered by settled payroll rejected; original records retained | Passed |
| 4 | Unauthorized record access | Prevent access to another employee's private records | An employee requesting E2 data received only their own E1 attendance, payroll, and requests; administrator API access denied | Passed |
| 5 | Offline queue and reconnection | Queue eligible actions; revalidate and synchronize | Request persisted as Pending in IndexedDB, survived offline reload, and synchronized after reconnect; server validation tested separately | Passed |
| 6 | Duplicate synchronization | Process one queued operation at most once | Retry reused the original operation ID; no duplicate business mutation, notification, or payroll recalculation in tested cases | Passed |
| 7 | Network interruption | Preserve the operation and report its pending state | Simulated lost response retained the operation locally as queued; local-save feedback shown and retry did not duplicate the action | Passed |
| 8 | Local storage failure | Surface an error without claiming a successful local save | Injected IndexedDB write failure surfaced an error and rejected the local save | Passed |
| 9 | Payroll carried balance | Carry unpaid earnings accurately | Prior unpaid amounts included in carried earnings and destination payout; concurrent creation and source-linking rules passed | Passed |
| 10 | Cash advance repayment | Post repayment only on confirmed settlement | Preparation/approval did not reduce debt; confirmed settlement applied eligible deductions; carried sources did not duplicate repayment | Passed |

## Evidence mapping

- Cases 1–3: `backend/src/attendance-corrections.test.js`, `backend/src/offline-operations.test.js`; future capture also in `scripts/offline-browser-smoke.mjs`.
- Case 4: `backend/src/security-regression.test.js` exercises actual localhost HTTP routes with two employees' controlled records, plus `backend/src/employee-updates-routes.test.js` for ownership filters.
- Cases 5–8: `scripts/offline-browser-smoke.mjs`; backend acceptance, authorization, transaction rollback and idempotency in `backend/src/offline-operations.test.js`. Browser and backend checks are separate; they are not a real Atlas outage trial.
- Cases 9–10: `backend/src/payroll-preparation.test.js`, `backend/src/cash-advances.test.js`, and `backend/src/cash-advance-requests.test.js`.
- Logs: `tools/security-auth-results.log`, `tools/security-backend-results.log`, and `tools/security-browser-results.log`.

Physical scanner accuracy, real email delivery, provider network/database permissions, and the live deployed build remain outside these results. Local cache owner-identifier separation is not independent login sessions across tabs.
