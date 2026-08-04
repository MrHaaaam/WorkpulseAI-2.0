# Security Change Copy

## Implemented in this revision

- Retained salted `scrypt` password hashing with timing-safe verification.
- Added rate limiting to CAPTCHA, login, OTP verification, and password re-verification.
- Retained OTP expiration and attempt limits and added structured success/failure auditing.
- Added opaque HttpOnly session cookies with production `Secure` and `SameSite=Lax` attributes.
- Added CSRF tokens bound to server sessions for state-changing browser requests.
- Added frontend credential and CSRF handling through a shared API client.
- Protected every employee, attendance, leave, payroll, settings, and archive API with authentication and `admin` role enforcement.
- Added reusable `requireRole` middleware for future `regular` and `extra` employee accounts.
- Added employee field allowlisting, normalization, enumerations, size limits, and numeric coercion.
- Added a 100 KB JSON body limit and defensive HTTP response headers.
- Added production HTTPS redirect behavior behind a trusted proxy.
- Added persistent MongoDB audit events for important authentication activity and all business data mutations.
- Added an important-only seven-day terminal audit report.
- Added binary confusion-matrix metrics and regression metrics utilities for future real evaluation data.
- Added a DFD, STRIDE review, risk register, RBAC matrix, deployment checklist, and biometric evaluation protocol.

## Deliberately not claimed

- Employee authentication is not implemented; `regular` and `extra` remain employment categories until credentials and ownership authorization are designed.
- No biometric accuracy is claimed because WorkPulse does not yet receive real biometric match decisions or a labeled evaluation dataset.
- The AI methodologies shown in the interface are not claimed as running production models.
- TLS certificates are not embedded in the Node application; production TLS belongs at the deployment proxy/platform.
- The in-memory limiter is not claimed to coordinate multiple backend instances.
