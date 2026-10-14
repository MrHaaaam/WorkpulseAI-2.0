# WorkPulse offline test results

Date: October 13, 2026 (Asia/Manila).

The expanded browser run passed. The targeted backend/authentication run passed 47 checks; the final full backend run passed 207 checks, with zero failures, skips, or cancellations. These counts are automated checks, not participants or physical scanner trials.

## Environment

Isolated Microsoft Edge 155, real IndexedDB and service-worker caching, controlled API responses, and the current production frontend build. Backend business tests use simulated database records; authentication regression tests exercise actual Express routes through localhost HTTP with mocked database records and email-provider responses. No real employee, payroll, or Atlas data was changed. No deployment was performed.

## Success paths

| Case | Observed result | Status |
| --- | --- | --- |
| Prepared employee workspace read without connectivity | Cached profile, attendance, payroll, leave, and cash-advance categories returned with the offline-response marker | Passed |
| Prepared employee calendar and notification cache reads | Saved responses returned offline; these checks exercise cache retrieval rather than every page interaction | Passed |
| Prepared administrator directory, attendance range, and correction preview | Cached responses returned offline; directory cache excluded password hashes and fingerprint sample fields | Passed |
| Employee saves a leave request offline | HTTP 202, Pending item in IndexedDB, local-save feedback; no server mutation at offline save time | Passed |
| Employee saves a cash advance request offline | HTTP 202, Pending cash-advance item and request-period marker; not approval or disbursement | Passed |
| Administrator saves manual attendance locally | Pending attendance item stored through the Offline Center interface | Passed |
| Eligible administrator correction | Backend preserves reasons, source, actor/history and notifications; unpaid payroll refresh invoked | Passed |
| Offline page reload | Prepared shell and personal view reopened without connectivity; Pending queue survived reload | Passed |
| Reconnect employee requests | Session checked and pending requests marked Synced after controlled acceptance | Passed |
| Administrator explicitly confirms synchronization | Attendance applied once after password confirmation; password not persisted and input cleared | Passed |

## Rejection and failure paths

| Case | Observed result | Status |
| --- | --- | --- |
| Fresh login or OTP submission offline | Online-connection error; no queued action | Passed |
| Fingerprint capture/matching API action offline | Online-connection error; no queued biometric operation | Passed |
| Leave/cash-advance approval, cash-given confirmation, payroll payment, employee creation, or settings write offline | Online-connection error; queue count unchanged | Passed |
| Offline save without prepared account identity | Rejected with sign-in/preparation error | Passed |
| Offline save after local session expiry | Rejected; existing queued records retained | Passed |
| Missing cache or eight-day-old cache | Not returned; read reports no recent local copy | Passed |
| Attempt to cache unsupported settings data | Not cached | Passed |
| IndexedDB write/quota failure | Local write rejected and storage error surfaced | Passed |
| Password, token, biometric samples, or oversized data in queued payload | Rejected before storage | Passed |
| 201st unsynced queued record | Rejected at the 200-record limit; existing records preserved | Passed |
| Future date/time, equal times, or past missing time-out in manual capture | Rejected before local save, including submission bypassing native browser validation | Passed |
| Duplicate local attendance | Rejected by the Offline Center; only one local record retained | Passed |
| Employee attempts administrator attendance correction or synchronization | Role check rejects the action; administrator password requirement remains enforced | Passed |
| Attendance belongs to settled payroll or payroll changes during review | Edit rejected without overwriting protected attendance | Passed |
| Stale attendance preview, overlapping sessions, existing scan conflict, or inactive/missing employee | Backend rejects the operation without partial mutation | Passed |
| Leave date expired in queue, invalid date, overlapping approved leave, or nonworking date | Rejected at synchronization; deliberate backdated online request handled separately | Passed |
| Advance exceeds limit, lacks repayment agreement, has expired period, duplicates an open request or existing cash disbursement | Rejected at synchronization | Passed |
| Database receipt, notification, or payroll-refresh failure | Controlled transaction rollback preserves prior records | Passed |

## Alternative and recovery paths

| Case | Observed result | Status |
| --- | --- | --- |
| Response lost after simulated server acceptance | Client retains operation locally and retries with the same operation ID | Passed |
| Duplicate synchronization or retry | No second business mutation, notification, or payroll refresh in tested conditions | Passed |
| Same operation ID reused with a different payload | Backend rejects the changed payload | Passed |
| HTTP 503 during synchronization | Synchronization pauses; items remain Pending | Passed |
| HTTP 409 validation conflict | Item becomes Needs review with the returned error | Passed |
| Reviewed retry after transient conflict | Item reset to Pending, retried, and marked Synced on acceptance | Passed |
| Reconnection without administrator confirmation | Employee requests can synchronize; attendance remains Pending | Passed |
| Valid existing session restored while offline | Session fallback permits prepared offline access | Passed |
| Expired or missing session during offline restoration | Restoration refused; IndexedDB queue survives simulated session-storage loss | Passed |
| Owner identifier changes in the browser | Prior owner's cached reads and queue are not returned under the new owner identifier | Passed |
| Authorized correction removes or reopens a session | Correction history retained; unpaid payroll recalculated where applicable | Passed |
| Missing attendance represented by automatic Absent record | Eligible manual capture can fill that record; real scanned attendance cannot be silently overwritten | Passed |
| Overnight correction | Next-day checkout handled and neighboring-session overlaps rejected | Passed |
| Offline Center search/status/type/date filters and reset | Matching records displayed and reset restored all records | Passed |

## Limits and observations

- Account-owner separation was tested by changing the local owner identifier. It does not prove independent login sessions across tabs. Separate actual HTTP checks restrict employee workspace data to the authenticated employee.
- Session-storage loss was simulated. A complete browser process restart, private browsing, device changes, and different browsers were not tested in this run. Pending data survives ordinary reload and simulated session loss, but clearing site storage removes local copies.
- Cache availability requires that exact eligible API path to have been loaded/cached previously. The employee workspace includes the listed personal categories; data can be stale, and a new device or uncached month may have no local copy.
- Some checks invoke client API/storage functions directly; selected interface flows also ran. This is not exhaustive coverage of every screen/button combination.
- Physical fingerprint operation, actual Brevo delivery, Render/Vercel outage behavior, and Atlas transactions/permissions were not tested live. Offline fingerprint operations were verified to be blocked, not to identify a finger.
- Initial expanded-run failures were test-harness issues: dynamically importing unprepared test modules while offline, and capacity-test fixtures lacking required leave fields. Fixtures/modules were corrected; the final browser run passed. No application code was changed for this test request.

## Evidence

- Browser: `tools/offline-expanded-browser-results.log`
- Targeted backend: `tools/offline-expanded-backend-results.log`
- Full backend: `tools/offline-full-backend-results.log`
- Browser scenarios: `scripts/offline-browser-smoke.mjs`
- Server scenarios: `backend/src/offline-operations.test.js`, `backend/src/attendance-corrections.test.js`, `backend/src/employee-updates-routes.test.js`, and `backend/src/security-regression.test.js`
