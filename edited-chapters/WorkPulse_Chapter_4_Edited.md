# Chapter 4: Conclusions and Recommendations

This chapter draws conclusions from the qualitative interview topics, the SUS usability result, and documented functional verification. These evidence sources address different aspects of WorkPulse and are interpreted within their respective limits.

## Conclusions

1. The interview findings described workplace concerns involving attendance record accuracy, proxy-attendance risk, monitoring of work hours, payroll processing, and employee access to records. These topics informed the requirements for centralized workforce information. No separate workplace-problems survey was used to assign percentages to those concerns.

2. WorkPulse implements employee records, local fingerprint attendance, authorized manual attendance and corrections, notifications, leave and cash advance requests, payroll summaries, descriptive reports, and selected analytical functions. Administrator and employee access groups are maintained separately from the Regular, Extra, and Manager / Supervisor employee classifications.

3. The researchers’ computed SUS score of 80.83 was interpreted as Good and Acceptable. This result supports favorable perceived usability. It does not independently establish technical correctness, security assurance, or fingerprint performance.

4. Local verification on October 11, 2026 reported 175 passing backend checks with zero failures. The production build and isolated browser checks completed successfully. Tested outcomes included attendance validation, payroll repayment handling, notification targeting, legacy role compatibility, local request storage, reconnect synchronization, account isolation, and duplicate prevention.

5. Cash advance requests and approval alone do not create debt. Confirmed disbursements establish outstanding balances, while posted repayments reduce them. Controlled tests showed that eligible installments accumulate across carried earnings periods and that carried source statements do not duplicate repayments.

6. Limited offline saving supports selected attendance actions and employee requests on prepared browsers with valid sessions. Server acceptance remains subject to authorization and current business rules. Fresh login, fingerprint transactions, approvals, and settlement actions still require online services.

7. Fingerprint attendance depends on the configured local Windows reader and matching environment. The available records do not establish numerical biometric accuracy or processing speed. Live deployment recovery and forecasting accuracy also remain outside the evidence established by these local software checks.

## Recommendations

1. Conduct controlled physical-reader trials using consenting participants. Record enrolled templates, genuine and unrecognized-finger trials, failed captures, identification outcomes, reader conditions, and elapsed verification times.

2. Maintain documented recovery procedures for the local workstation, reader software, and matching components. Obtain organizational approval for a supervisor-verified paper attendance log and its later reconciliation through authorized manual entry.

3. Verify the final Vercel/Render deployment using real session, ownership, notification, payroll, and outage scenarios. Evaluate the local-to-cloud attendance architecture before claiming that the cloud backend can use locally installed matching components.

4. Extend outage and recovery testing across browsers, devices, session expiry, prolonged disconnection, storage limits, duplicate retries, and conflicting updates. Retain test records for the environment and application version evaluated.

5. Improve attendance exception review, cash advance reconciliation, carried-balance reporting, and notification preferences beyond the existing functions.

6. Evaluate analytical outputs against relevant real outcomes using documented methods and error measures. Forecasts and risk indicators should continue to support human review rather than automatic employment decisions.

7. Retain interview records, the original SUS instrument and scoring sheets, test logs, and deployment evidence as supporting project materials. Future revisions should repeat the applicable functional checks when business rules change.
