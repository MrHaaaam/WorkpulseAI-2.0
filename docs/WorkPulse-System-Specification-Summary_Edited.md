# WorkPulse System Specification Summary

WP-SRS-SUM-001 • Reviewed October 13, 2026

W O R K P U L S E

System Specification Summary

WP-SRS-SUM-001 • Reviewed October 13, 2026

1. Project Overview and Users



WorkPulse is an implemented web-based employee attendance and work analytics information system for MVL. It centralizes employee, attendance, leave, cash advance, and payroll records. Interviews identified manual Excel payroll preparation and possible proxy attendance as principal concerns, alongside monitoring, transparency, and attendance inaccuracies.

| User or classification | Capabilities |

| --- | --- |

| Administrator / Owner | Authorized administrator accounts maintain records and settings, review attendance and corrections, decide requests, record disbursements and payroll settlement, inspect reports, logs, and analytical indicators |

| Employee | View authorized personal attendance, payroll/payslip summaries, requests, balances, and notifications; submit eligible leave/cash advance requests and maintain permitted contact details |

| Regular, Extra, Manager / Supervisor | Employee classifications, not separate portals or administrator privileges. Manager and legacy supervisor records use the combined management classification/rate |



Implemented Modules



| Module | Important functions |

| --- | --- |

| Accounts and employee directory | Authentication, account status, archive/access controls, employee records, password changes and recovery |

| Attendance and biometrics | Configured fingerprint kiosk, manual attendance, daily/date-range views, correction reasons/history, notifications, and settled-payroll protection |

| Leave and cash advances | Requests and administrator decisions; cash-given confirmation, outstanding balances, and payroll repayment tracking |

| Payroll and reporting | Attendance-based earnings, additions, carried unpaid earnings, deductions, settlement/history, payslip summaries, CSV/Excel exports |

| Insights and settings | Statistical attendance forecast, historical absence indicators, unusual-arrival analysis, biometric operational indicators, schedules/rates, audit logs |

| Offline and recovery | Selected cached views and queued actions; downloadable database backup and separate recovery tools |




---


2. Architecture and Technology



| Component | Implementation and boundary |

| --- | --- |

| Browser frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts, and ExcelJS. Administrator, employee, and attendance kiosk interfaces |

| Application backend | Node.js and Express with MongoDB/Mongoose libraries. Enforces sessions, roles, record ownership, input/business rules, notifications, and audit logging |

| Database | MongoDB Atlas used through the backend; browser code calls APIs rather than directly connecting to Atlas |

| Hosting | Vercel frontend and Render backend on free tiers. vercel.json forwards /api requests to the configured Render URL |

| Local biometric runtime | Compatible DigitalPersona reader/SDK components and the Windows PowerShell/FingerJet helper. The matching code launches powershell.exe where that backend process runs; remote Render cannot access a workstation USB reader by itself |

| Email | Supports Brevo HTTPS and Gmail/SMTP. The user reports Brevo; live provider selection, sender configuration, and delivery require verification |

| Browser-local storage | IndexedDB for supported queued actions and selected cached data; service worker for eligible application assets |



Insights: Actual Implementation



| Indicator | Current method |

| --- | --- |

| Seven-day attendance forecast | JavaScript Holt-Winters additive calculations with a bounded weekday baseline. Data volume/freshness checks identify ready or limited output |

| 30-day attendance risk | Counts recorded unapproved absences in the preceding 30-day window, excluding approved leave. It is a historical indicator, not a prediction of the next 30 days |

| Unusual arrival detection | Modified Z-score using a median absolute deviation baseline and readiness checks |

| Biometric operational health | Summaries of recorded match/verification activity and evaluation records; not proof of scanner accuracy |




---


3. Workflows and Operating Rules



| Workflow | Implemented behavior |

| --- | --- |

| Login and recovery | CAPTCHA, credentials, account-status checks, email OTP, sessions, first-login password change, and employee password recovery. Designated tester accounts use OTP bypass |

| Attendance | Fingerprint time-in/time-out or authorized manual entries; validates times, chronology, and overlapping sessions |

| Corrections | Administrator password and reason, source indicators, before/after history, and employee notification; settled payroll restricts edits |

| Leave | Employee requests; administrator approval/rejection with schedule, attendance-conflict, and payroll checks |

| Cash advances | Request approval, cash-given confirmation, outstanding-balance tracking, and repayment through settled payroll |

| Payroll | Attendance hours and rates, additions, deductions, carried unpaid earnings, payslip summaries, and settlement records |

| Offline synchronization | Supported actions saved locally; session validation, administrator confirmation for attendance, server conflict checks, and duplicate prevention |



4. Data, Security, and Recovery



Employee identifiers link accounts, attendance, leave, cash advances, payroll, and notifications. Settings, audit events, and biometric records support administration.

| Area | Controls or procedure |

| --- | --- |

| Authentication | Salted scrypt hashes, hashed OTP/session tokens, five-hour sessions, HttpOnly cookies, production Secure flag, and logout revocation |

| API access | Server-side roles and ownership checks, CSRF protection, and administrator password confirmation for designated actions |

| Validation and throttling | Bounded inputs, business-rule checks, one-use OTP/reset exchanges, request-size limits, and IP-based request limits |

| Biometric storage | AES-256-GCM encrypted templates; raw samples processed into templates |

| Audit and notifications | Administrative/security events, traceable corrections, personal notices, and audit-retention indexing |

| Backup and recovery | JSON backup of stored collections; full restore into an empty database, or selective recovery of missing business records while preserving existing records |



Full restoration returns records to the backup state: later attendance, account changes, and payment confirmations are absent unless recovered separately. Automatic absence processing may classify missing recent workdays as Absent. Reconcile attendance and actual payments before operational use; a restore does not reverse money already paid. Exported CSV/Excel reports are not database recovery backups.