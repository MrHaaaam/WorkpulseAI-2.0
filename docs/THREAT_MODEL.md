# WorkPulse Threat Model

## Data-flow overview

```text
Admin browser
  | HTTPS + session cookie + CSRF header
  v
React application ----> Express API ----> MongoDB Atlas
                            |
                            +-----------> Gmail SMTP
                                            | OTP / payroll email
                                            v
                                       User mailbox
```

Trust boundaries exist between the browser and API, API and MongoDB, API and SMTP provider, and WorkPulse administrators and employee records.

## Protected assets

- Administrator credentials, OTPs, and sessions
- Employee personal and government identifiers
- Attendance and biometric enrollment status
- Leave information and reasons
- Payroll amounts and delivery records
- Company policies and security audit events

## STRIDE analysis

| Threat | Example | Primary controls | Residual work |
|---|---|---|---|
| Spoofing | Stolen password or session | MFA, hashed passwords, opaque sessions, HttpOnly cookie, expiry | Add account recovery and session management |
| Tampering | Direct payroll/status request | Authentication, admin RBAC, CSRF, allowlisted writes, audit trail | Add transaction/version controls for concurrent updates |
| Repudiation | Admin denies approving leave | Persistent actor/action/outcome audit events | Export immutable centralized logs |
| Information disclosure | Employee/payroll API queried anonymously | All business APIs require admin authentication | Add field-level encryption for especially sensitive identifiers |
| Denial of service | Repeated login/OTP requests | Body-size limit and endpoint rate limits | Redis/distributed limiting and infrastructure protection |
| Elevation of privilege | Employee calls admin endpoint | Server-side `requireRole('admin')` | Implement ownership middleware before employee login |

## Risk register

Scoring uses likelihood (1–5) × impact (1–5).

| Risk | Likelihood | Impact | Score | Priority |
|---|---:|---:|---:|---|
| Session/account compromise | 3 | 5 | 15 | High |
| Payroll tampering | 2 | 5 | 10 | High |
| Sensitive employee-data disclosure | 2 | 5 | 10 | High |
| Brute-force authentication | 2 | 4 | 8 | Medium after controls |
| Audit-log loss/tampering | 3 | 4 | 12 | High until centralized export |
| Misleading AI decisions | 3 | 4 | 12 | High until models are implemented and validated |
| Service exhaustion | 3 | 3 | 9 | Medium |

Risk scores are planning aids, not proof of security. Reassess them after deployment architecture, employee authentication, biometric hardware, and operational policies are known.
