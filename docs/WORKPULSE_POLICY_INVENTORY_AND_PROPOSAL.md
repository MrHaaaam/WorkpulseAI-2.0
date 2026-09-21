**WorkPulse Policy Inventory and Management Proposal**

Organization: MVL  
Status: Draft for management review; not yet an adopted company policy  
Review date: September 21, 2026  
Prepared by: __________  
Approved by: __________  
Effective date: __________  
Next review date: __________

**Purpose and scope**

This document identifies policy-related behavior in the local WorkPulse source code and provides proposed operating rules for management consideration. It covers administrators, Regular and Extra employees, attendance kiosk use, leave, payroll, records, biometrics, and system administration.

Evidence is from static review of backend routes, security helpers, biometric processing, scheduling, analytics, and relevant frontend screens. The running database settings, deployed version, and hardware were not inspected or tested. A rule found in code is not proof of correct behavior in every scenario or management approval. This document does not determine employment, wage, benefit, or privacy entitlements.

Labels used below:

- **Implemented:** Explicit behavior in the inspected code.
- **Configurable:** Supported setting; listed defaults are fallback code values, not verified live company settings.
- **Proposed:** Organizational rule for management to consider; not necessarily enforced by WorkPulse.
- **Gap:** Missing, inconsistent, or incomplete enforcement requiring a decision or implementation work.

**1. Account ownership and access**

Implemented:

- Administrative operations require an authenticated account with the `admin` role. Employee portal routes accept `regular` and `extra` roles.
- Employee data is selected using the employee ID linked to the signed-in account. Employees access their own records and cannot use administrative routes.
- Employees can update their own phone number and address. The employee portal does not provide self-service editing of pay rates, role, attendance entries, or payroll amounts.
- Account access can be blocked by an administrator; blocking deactivates the employee account and deletes its active sessions.
- Maintenance mode blocks employee authentication/access while administrators retain access.
- The kiosk attendance API sits behind administrator authorization. Employees supply fingerprints through an administrator-operated kiosk; they do not receive administrator rights.
- A company job title such as manager does not automatically confer a separate system permission level. The general administrative route guard requires `admin` even where an individual endpoint also mentions `manager`.

Proposed policy: Each user shall use an individually assigned account. Account sharing and use of another person's credentials shall be prohibited. Management shall name the administrator and authorized backup administrator. Kiosk operation shall be supervised or restricted so employees cannot navigate into administrative functions.

Decisions: Primary administrator __________; backup administrator __________; access approver __________; procedure for temporary access __________.

Source: [Access controls](../backend/src/security.js), [API role boundaries and employee portal](../backend/src/routes/api.js).

**2. Passwords, login, and recovery**

| Rule | Current implementation |
|---|---|
| Employee replacement/reset password | 8–32 characters |
| Administrator password change | 8–64 characters |
| Temporary employee password | System-generated 14-character password emailed to the employee |
| First use | Employee must replace the temporary password before accessing application API functions |
| Reusing the current password | Rejected during the inspected employee reset/initial-change and administrator change workflows |
| Password storage | Salted scrypt hashes; passwords are not stored as readable account passwords |
| Login process | Email, password, arithmetic CAPTCHA, then email OTP |
| CAPTCHA validity | 5 minutes; submitted challenge is consumed by the login attempt |
| Login OTP | Six digits; 10-minute validity; record rejected after five failed code attempts |
| Session duration | Hard maximum of five hours from session creation; not a five-hour inactivity timer |
| Employee forgot-password flow | Email verification code, then a short-lived reset token; reset code and subsequent token each have a 10-minute window |
| Password reset completion | Revokes the employee's existing sessions |
| Administrator credential change | Requires current password; revokes other administrator sessions and pending login OTPs; current session remains |

Implemented throttling:

- Login: eight requests per 15 minutes per limiter identity.
- Login OTP verification: ten requests per ten minutes, with the separate five-failed-attempt limit on each OTP record.
- CAPTCHA generation: twenty requests per minute.
- Password reset requests and completion: five requests per 15 minutes for each endpoint; reset verification: ten requests per ten minutes.
- Limiter identities combine endpoint, IP, and supplied email where present. These are request limits, not an eight-failed-password permanent account lockout.
- Protected administrator password confirmation starts a five-second cooldown after the third failed confirmation. Further failures increase the cooldown by ten seconds, capped at fifty seconds.
- Limiters/cooldowns are in application memory; restart and multiple server instances affect persistence and scope.

Gaps: No general uppercase/lowercase/number/symbol composition requirement, periodic password expiry, or multi-password history was found. The employee and administrator maximum lengths differ. The inspected forgot-password route is employee-specific. Administrator-issued replacement credentials do not use exactly the same session-revocation behavior as employee self-service reset.

Proposed policy: Users shall keep passwords and OTPs private, replace temporary credentials immediately, and report suspected misuse to __________. Management shall decide whether password-length rules should be unified and define administrator account recovery. Do not describe complexity or scheduled expiry as enforced unless implemented.

Source: [Authentication](../backend/src/routes/auth.js), [Session security](../backend/src/security.js), [Administrator credential changes and account provisioning](../backend/src/routes/api.js).

**3. Employee registration and record maintenance**

Implemented:

- Administrators create employee accounts; a registration control can disable new employee creation. This is not open public registration.
- Creation requires first name, last name, email, phone, address, and successful fingerprint enrollment.
- Administrator registration/editing requires phone format `+639XXXXXXXXX` without spaces. Employee self-service contact updates instead accept 7–30 characters using numbers and permitted telephone punctuation; the two validation rules differ.
- New accounts use a generated employee ID such as `EMP-001`. IDs referenced in linked collections are considered when choosing the next ID.
- Email duplication is checked across administrator accounts, employee accounts, and employee profiles in the registration workflow.
- Employee roles are Regular or Extra. Confirm the intended company meaning of Extra rather than automatically equating it to every part-time/student employee.
- Successful account creation depends on fingerprint validation and email delivery. The workflow attempts to roll back creation if delivery fails.
- Administrator profile editing, fingerprint replacement, and issuing replacement login credentials require administrator password confirmation.

Proposed policy: An authorized administrator shall verify employee identity, role, contact details, and the correct email recipient before registration. Employees shall report inaccurate records and keep contact details current. Changes affecting classification or payroll shall have documented management authorization.

Decisions: Required profile information __________; meaning of Regular/Extra __________; record-change approver __________.

Source: [Employee registration and editing](../backend/src/routes/api.js).

**4. Fingerprint enrollment and use**

Implemented:

- Enrollment requires exactly three separately captured scans of the same finger. All three template pairs must agree under the matcher threshold.
- Templates already stored for any employee, including inactive or archived employees and the same employee's existing enrollment, are checked for duplication.
- Consequently, re-enrollment with an already stored finger can be rejected even for the same employee.
- Enrollment converts samples into ANSI-378 fingerprint templates and stores them encrypted with AES-256-GCM. The inspected enrollment route does not persist raw fingerprint images.
- Attendance uses one submitted scan for a one-to-many match against eligible employee templates.
- Matching uses a configurable threshold, with a code default of 21,474. This is a matcher score threshold, not a measured WorkPulse accuracy percentage.
- The displayed match-strength value is derived from a score conversion; it is not independently measured verification accuracy.
- Device identifier, match information, and verification timing can be recorded. No device-identifier allowlist enforcement was found.

Proposed policy: Fingerprints shall be enrolled under authorized supervision and used only for the approved identity-verification purpose. Employees shall receive an explanation of collection, use, storage, access, and disposal. A documented alternative shall be available for scanner failure, injury, or unsuccessful capture, with designated approval and reconciliation responsibilities.

Gaps: A complete biometric notice/acknowledgment workflow, fallback attendance process, biometric-specific retention period, and key-rotation procedure were not found. A dedicated biometric encryption key is supported, but the code falls back to deriving key material from the database connection string if it is absent.

Decisions: Biometric information notice __________; exception approver __________; fallback evidence __________; retention/disposal rule __________; key custodian __________.

Source: [Biometric rules](../backend/src/biometrics.js), [Enrollment and kiosk routes](../backend/src/routes/api.js).

**5. Work schedule and attendance**

| Setting/rule | Code default or behavior | Management decision |
|---|---|---|
| Attendance calendar/time | Kiosk uses Asia/Manila server-generated date/time | __________ |
| Company start | 09:00 | __________ |
| Automatic clock-out | 18:00 | __________ |
| Late grace period | 0 minutes; configurable 0–180 | __________ |
| Workweek | Monday–Friday, five days; supports 1–7 selected weekdays | __________ |
| Special dates | Holiday, rest-day, or workday override | __________ |
| Daily sessions | Maximum three Time-In/Time-Out pairs | __________ |
| Repeated scans | Rejected within 30 seconds of the attendance record's last update | __________ |

Implemented:

- A recognized fingerprint creates a Time-In when there is no open session; the next accepted scan closes the open session. Further pairs are allowed up to the daily limit.
- New Time-In is blocked on scheduled non-working days and approved leave dates. An existing open session can still be closed.
- Archived/inactive employees are excluded from the active biometric candidate list.
- An arrival strictly after start time plus grace is Late; an arrival exactly at the cutoff is Present. The first arrival determines the daily arrival status.
- Automatic clock-out is checked at server startup and every minute, and can also be invoked during other workflows. Availability of the server/database is required.
- The automatic closer places an earlier-or-equal clock-out time on the following day relative to the session's check-in. End-to-end overnight kiosk behavior still needs verification because kiosk lookup uses today's date.
- Administrators may force-close selected open sessions for the current Manila date. The action records the administrator and time; it does not select an arbitrary historical clock-out time.
- Automatic absence reconciliation reviews the previous thirty dates, excluding today. It creates Absent entries on scheduled workdays without an existing attendance record or covered approved leave, considering employee creation date.
- Absence checks run at startup and every fifteen minutes. They are not proof that a same-day absence is immediately recorded.
- Existing past date-specific schedule overrides are preserved during settings updates. Changing the regular workweek is a separate operation and can still affect historical absence reconciliation.
- Settings updates remove newly non-working dates from pending/approved leave records and cancel a request if no eligible dates remain.

Proposed policy: Employees shall record their own arrival and departure and check the kiosk confirmation. Missed, incorrect, automatic, or forced clock-outs shall be reported to __________ within __________. The administrator shall review exceptions before payroll. Management shall specify whether breaks require clock-out and how work on rest days or beyond the normal shift is authorized.

Gaps: No general employee attendance-correction request/approval workflow was found. No fixed meal-break deduction, minimum interval between sessions beyond scan suppression, overtime approval workflow, or early-arrival pay restriction was found. Blocking portal access does not necessarily block biometric attendance: the biometric eligibility query does not check the separate `banned` flag.

Source: [Scheduling, attendance calculations, absence reconciliation, and kiosk](../backend/src/routes/api.js), [Background checks](../backend/src/server.js), [Forced clock-out](../backend/src/force-clock-out.js).

**6. Leave application and approval**

Implemented:

- Active, non-archived employees can submit their own leave requests.
- Available labels are Annual Leave, Sick Leave, Personal Leave, and Maternity Leave.
- A request contains 1–366 distinct selected dates and a reason of 5–500 characters. Dates may be nonconsecutive. The 366-date input limit is not an entitlement.
- Scheduled non-working dates are rejected. Selected dates overlapping an existing pending/approved request are rejected.
- Requests start as pending. Employees can cancel only their own pending requests.
- Administrators approve or reject pending requests; individual approval can include only a subset of requested dates.
- Approval checks the work schedule, existing clock-in conflicts, and remaining allowance in every affected month.
- The code uses one shared monthly allowance across all four leave labels. The default is ten credits per employee per month; the configurable range is 0–31.
- One approved selected date consumes one credit. Approved dates count against the month in which they fall. Pending requests do not consume credits in the monthly balance calculation.
- No unused-credit carryover/accrual ledger was found; each month's remaining amount is computed from the configured allowance and approved dates in that month.
- Approval creates On Leave attendance entries; it does not create worked sessions or automatically add paid-leave earnings to payroll.
- Bulk decisions require administrator password confirmation. Individual decisions and undo-approval require administrator access but do not independently recheck the password in those routes.
- Undo-approval removes current/future approved dates, retains past approved dates, and cancels the request if no past dates remain. Associated current/future On Leave entries without check-ins are removed.

Proposed policy: Employees shall submit leave type, dates, and reason for administrator review. Submission shall not be described as approval. The company shall publish its notice period, emergency process, evidence requirements, approval authority, and separate entitlement/pay treatment for each applicable leave category.

Decisions: Monthly allowance __________; eligibility __________; paid/unpaid treatment __________; advance notice __________; emergency/retroactive process __________; documents __________; response deadline __________; appeal process __________.

Gaps: No general advance-notice minimum, past-date ban, half-day leave, medical-document upload, required rejection reason, or distinct category-specific entitlement calculations were found. The presence of a Maternity Leave option does not establish that its entitlement rules are implemented. Confirm the company rules before adopting the shared monthly pool.

Source: [Submission, monthly balances, approval, and reversal](../backend/src/routes/api.js), [Leave date selection](../src/components/LeaveDatePicker.tsx).

**7. Payroll calculation and compensation**

Implemented standard preparation:

- Payroll periods run from the 1st–15th and the 16th–last day of the month. The second period is not always exactly fifteen days despite some labels/fields saying “15-day.”
- Only completed attendance sessions contribute hours. Open sessions produce warnings and do not yet contribute completed hours.
- Session intervals are summed; no automatic meal-break subtraction is applied.
- Payroll preparation rounds total worked hours to two decimals and attendance-based earnings to two decimals.
- Rate comes from company settings by employee category: Regular defaults to PHP 50/hour; Extra defaults to PHP 40/hour. Each is configurable between 1 and 10,000. These are software defaults, not recommended or verified company wage rates.
- An individual profile hourly-rate field exists, but the standard preparation function uses the company role-based rate.
- Attendance-based earnings = completed hours × category hourly rate.
- Current-period amount = attendance-based earnings + profile additions + bonus.
- Total recorded payable = current-period amount + carried unpaid balance.
- Positive amounts entered under profile identifiers are treated as additions. Labels such as SSS or PhilHealth do not turn those amounts into deductions.
- Bonuses can be added to an individual or all matching unpaid records; each addition is between PHP 0.01 and PHP 1,000,000 and is cumulative.
- Earlier eligible unpaid/held payroll can be carried forward and linked to the receiving payroll record.
- Paid records are not ordinarily recalculated by the standard preparation function. Eligible unpaid/carried records can be recalculated.
- Changing company settings recalculates eligible current-period unpaid records using the new settings; an effective-dated rate history was not found.

Proposed policy: Management shall approve the applicable rates and additions. Before marking payroll paid, the administrator shall reconcile attendance, exceptions, rates, additions, and prior balances against supporting records. Management shall specify cutoff dates and actual disbursement dates separately.

Decisions: Regular rate __________; Extra rate __________; rate effective dates __________; payable break rules __________; paid-leave treatment __________; additions __________; deductions __________; actual payment schedule __________; reviewer __________.

Gaps: No dedicated automatic calculation of overtime premiums, holiday/rest-day premiums, night differential, withholding tax, SSS, PhilHealth, Pag-IBIG deductions, or thirteenth-month pay was found in the inspected payroll calculation. Approved leave has no automatic paid-hours calculation. Do not present the resulting total as a fully validated statutory net-pay computation.

Additional inconsistency: A separate payroll-summary email route uses a rolling fourteen-days-back start rather than the standard calendar half-month period and can fall back to stored gross salary. Also, an alternate payroll creation route accepts administrator-supplied calculation values. Therefore, not every payroll path can be described as exclusively server-calculated from the same period and formula.

Source: [Rate selection, completed hours, payroll preparation, additions, and summaries](../backend/src/routes/api.js).

**8. Payroll approval, holds, reversals, and payslips**

Implemented:

- Payroll uses processing, rejected/held, carried_over, and paid states.
- Payment confirmation, hold, hold removal, last-payment undo, and payroll reset require administrator password confirmation.
- Bulk payment selects processing records. The individual confirmation route accepts processing or rejected records; the two routes do not enforce exactly the same hold behavior.
- Confirming payment updates records and records administrator/time information. No banking or money-transfer integration was found.
- Undo-last-payment targets the latest payment action for the selected period and is available only before fifteen days have elapsed since payment. If that action paid a batch, the batch is reversed together.
- Reversal changes recorded status; it does not recover funds already disbursed.
- Payroll reset can zero amounts, additions, bonuses, hours, and carryover, return the record to processing, and establish a new calculation baseline. Later calculation considers sessions beginning after that baseline. It is not an ordinary refresh.
- Payslips can be emailed to the employee's recorded address. Employees can view their own returned payroll records. Admin print/export actions have audit-reporting routes.
- The employee portal currently retrieves at most twelve payroll records; this is a display/query limit, not a retention period.

Proposed policy: Mark a record Paid only after payment has actually been confirmed outside WorkPulse. Holds, reversals, bonuses, and resets shall require a documented reason and management authorization. Reset shall not be used to erase an unresolved wage obligation. Payslip queries shall be submitted to __________ within __________.

Gaps: No separate preparer/approver permissions, required evidence of disbursement, required hold/reset reason field, or dedicated payroll dispute workflow was found. “Administrator-only” does not establish independent financial review.

Source: [Payment, hold, undo, reset, and payslip routes](../backend/src/routes/api.js).

**9. Archiving, offboarding, and permanent deletion**

Implemented:

- Archiving requires administrator password confirmation, marks the employee inactive/archived, deactivates linked accounts, and revokes sessions and pending login OTPs.
- Archiving keeps linked historical records and biometric templates; archived employees are excluded from normal active lists and kiosk candidates.
- Restoration reactivates the profile/account and reports biometric enrollment according to retained templates.
- Permanent deletion requires an archived employee and administrator password confirmation.
- Permanent deletion removes linked attendance, leave, payroll, biometric templates, matching verification/evaluation records, accounts, sessions, login OTPs, and some employee-linked audit events in a transaction.
- That route is not a complete guarantee of erasure from all exports, backups, notifications, or every possible audit reference.

Proposed policy: Offboarding shall normally archive access first. Permanent deletion shall occur only under an approved retention/disposal decision, after checking unresolved payments, records needed for review, and retained copies. Restoration shall require renewed access authorization.

Decisions: Offboarding owner __________; archive trigger __________; retention by record type __________; deletion approver __________; backup-copy handling __________.

Gap: No automatic post-employment retention schedule was found for attendance, leave, payroll, or biometrics. Inactive status, login block, archive, and restore have different effects; document and reconcile them before adoption.

Source: [Employee access, archive, restoration, and deletion](../backend/src/routes/api.js).

**10. Audit records, privacy, exports, and notifications**

Implemented:

- Audit events can record actor identity/role, timestamp, action, target, result, IP address, user agent, and selected metadata.
- The application attempts to create a ninety-day expiry index for audit events. Effective deletion depends on successful index setup and database background cleanup; it is not an exact-to-the-second guarantee.
- Notifications have a three-day lifetime. Notification expiry is separate from retention of the underlying attendance/leave/payroll records.
- Passwords and fingerprint samples are excluded from the general changed-field metadata list. Audit metadata can still contain personal and operational information.
- Audit write failure is logged and does not necessarily block the underlying action. Not every read or automatic background change is individually audited.
- Permanent employee deletion can remove some linked audit events, so logs should not be described as immutable.
- Employee portal attendance retrieval is limited to sixty records; that limit is not an automatic deletion rule.

Proposed policy: Authorized personnel shall use records only for approved workforce administration and research purposes. Downloaded reports and screenshots shall be shared only with designated recipients. Administrators shall review important failed/sensitive actions and handle employee correction requests through a documented process.

Decisions: Data custodian __________; allowed recipients __________; audit review interval __________; export storage __________; correction contact __________; research-data handling __________; incident reporting contact __________.

Source: [Audit middleware](../backend/src/security.js), [Retention index](../backend/src/server.js), [Notifications](../backend/src/notifications.js), [Exports and portal limits](../backend/src/routes/api.js).

**11. Backup, maintenance, and system administration**

Implemented:

- Administrators can download a JSON backup of selected collections, including employee records, attendance, leave, payroll, settings, controls, encrypted biometric templates, and biometric evaluation/attempt records.
- This export does not include all collections: account records, sessions, audit events, and notifications are not in its selected collection list.
- No automated backup schedule or application restore endpoint was found. The JSON export alone is not a demonstrated full disaster-recovery solution.
- Maintenance and new-registration controls are available. Maintenance mode does not shut down administrator-operated kiosk routes.
- Saving company settings requires administrator password confirmation.
- The Admin Controls screen has a password-unlock step, but some underlying routes, including backup/control/access/force-clock-out, rely on the admin session rather than independently rechecking the password on every action.
- Production API code redirects HTTP to HTTPS, uses protected session-cookie attributes, applies cross-origin restrictions, and checks CSRF tokens for cookie-authenticated changes. Actual deployment configuration still matters.

Proposed policy: A named administrator shall maintain backups at an approved interval, store them in a restricted location, protect the required encryption keys, and test recovery. Maintenance shall be announced, with a fallback attendance process and a reconciliation owner.

Decisions: Backup frequency __________; custodian __________; location __________; retention __________; recovery test frequency __________; maintenance notice __________; outage workflow __________.

Source: [Backup/control/settings routes](../backend/src/routes/api.js), [System controls](../backend/src/system-controls.js), [Server/security configuration](../backend/src/server.js).

**12. Analytics and attendance flags**

Implemented:

- Attendance flags count recorded unapproved Absent dates in the last thirty days: Green 0–15, Orange 16–25, Red 26 or more.
- Approved-leave coverage is excluded from that count. Lateness is counted separately and does not determine the color threshold.
- These thresholds are coded rules, not configurable company settings. Red may be unreachable in an ordinary five-day workweek over thirty calendar days; management should evaluate whether the thresholds are useful.
- Unusual-arrival detection uses a modified Z-score with a median-based baseline; absolute score above 3.5 is flagged. Fewer than seven scans gives limited-data status.
- Forecasting considers up to ninety days of history; ready status requires an active workforce, at least fourteen dates with clock-ins, and data no more than two days old.
- These are analytical outputs and data-readiness rules, not disciplinary findings or evidence of employee intent.

Proposed policy: Management shall verify source attendance and seek clarification before acting on a flag. Flags and forecasts shall support review, not automatically determine discipline, termination, or pay changes. Biometric match strength shall not be reported as measured accuracy.

Decisions: Reviewer __________; appropriate absence thresholds __________; follow-up process __________; employee correction/appeal channel __________.

Source: [Analytics rules](../backend/src/ai-insights.js), [Biometric score conversion](../backend/src/biometrics.js).

**13. Decisions to resolve before policy adoption**

| Priority issue | Required decision or verification |
|---|---|
| Wage rates | Replace/confirm fallback rates; approve rate effective dates and calculation method. |
| Shared leave allowance | Confirm entitlement by category and employee type; do not assume every leave label uses one monthly pool. |
| Paid leave and payroll components | Decide how paid leave, premiums, deductions, and other required components will be calculated and recorded. |
| Additions under identifiers | Prevent contribution/identifier labels from being mistaken for automatic deductions. |
| Attendance exceptions | Define missed-scan corrections, breaks, overtime, rest-day work, and outage fallback. |
| Overnight/timezone behavior | Test actual deployment and overnight sessions before publishing an overnight attendance policy. |
| Payroll holds/reversals/reset | Align permitted transitions and require documented reasons; distinguish record changes from cash movement. |
| Rate/schedule changes | Define effective dates and treatment of already-recorded periods. |
| Blocking and offboarding | Align portal access, biometric eligibility, inactive status, archive, and restoration. |
| Biometric handling | Approve notice, fallback, retention, and key management. |
| Retention and deletion | Approve periods by data type; account for backups/exports and audit deletion behavior. |
| Backup recovery | Define full backup scope and demonstrate restore. |
| Approval controls | Decide which operations need password re-entry or independent review; enforce this in relevant backend routes. |
| Absence flag thresholds | Review the 16/26-day boundaries against actual work schedules. |

**Management review record**

For each section, record Adopt as written / Adopt with changes / Defer, the approved wording and values, the responsible person, and the effective date. Where a decision differs from the current code, record an implementation task and verify it before claiming the policy is automatically enforced.

| Section | Decision | Approved changes/values | Responsible person | Effective date |
|---|---|---|---|---|
| Accounts and access | __________ | __________ | __________ | __________ |
| Passwords and recovery | __________ | __________ | __________ | __________ |
| Employee records | __________ | __________ | __________ | __________ |
| Biometrics | __________ | __________ | __________ | __________ |
| Attendance and schedules | __________ | __________ | __________ | __________ |
| Leave | __________ | __________ | __________ | __________ |
| Payroll calculations | __________ | __________ | __________ | __________ |
| Payments and corrections | __________ | __________ | __________ | __________ |
| Offboarding/deletion | __________ | __________ | __________ | __________ |
| Privacy/audit/exports | __________ | __________ | __________ | __________ |
| Backup/maintenance | __________ | __________ | __________ | __________ |
| Analytics | __________ | __________ | __________ | __________ |

Approval signature: __________  
Date: __________
