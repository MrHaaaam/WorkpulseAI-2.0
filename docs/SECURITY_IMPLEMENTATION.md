# WorkPulse Security Implementation

## Scope

This document describes the controls implemented in the WorkPulse source tree. Generated output and dependencies under `dist` and `node_modules` were excluded from review.

## Authentication and MFA

- Administrator passwords use Node.js `scrypt`, a random 16-byte salt, a 64-byte derived key, and timing-safe verification.
- Email OTP codes are six digits, stored only as salted hashes, expire after ten minutes, and lock after five incorrect attempts.
- CAPTCHA records expire after five minutes and are consumed after one login attempt.
- Login, OTP, CAPTCHA, and protected password-verification routes have in-memory IP/account rate limits.
- Sessions use cryptographically random opaque identifiers. Only a SHA-256 digest is stored in MongoDB.
- The browser receives the session identifier in an `HttpOnly`, `SameSite=Lax` cookie. Production cookies include `Secure`.
- Sessions expire after eight hours and are deleted on logout.

The rate limiter is suitable for a single application process. A multi-instance production deployment should replace it with a shared Redis-backed limiter.

## CSRF and browser security

Every cookie-authenticated state-changing business request requires an `X-CSRF-Token` whose digest is bound to the server session. Bearer authentication remains understood by the server for non-browser compatibility, but the web client uses the HttpOnly cookie.

API responses include CSP, frame denial, MIME sniffing protection, a restrictive permissions policy, no-referrer policy, and `Cache-Control: no-store`. Production requests are redirected to HTTPS when the trusted reverse proxy reports HTTP.

TLS certificates should be terminated by the production platform, Cloudflare, Nginx, or another reverse proxy. Local development remains HTTP.

## Validation and injection protection

Employee writes use an allowlist instead of copying the complete request body into MongoDB. Strings are normalized and length-limited; roles and statuses use explicit enumerations; monetary and hour values are converted to non-negative numbers; identifier arrays are bounded and normalized. Other endpoints already construct database updates from explicit fields.

React escapes normal text rendering. WorkPulse does not support rich user-authored HTML, so HTML should remain prohibited instead of sanitized and rendered. If rich text is added, use a maintained HTML sanitizer before storage or rendering.

## RBAC

`authenticate` validates a session and loads its actor. `requireRole(...roles)` enforces server-side roles. Current administrator routes require `admin`.

| Capability | admin | regular employee (future) | extra employee (future) |
|---|---:|---:|---:|
| View own profile/attendance/payslip | Yes | Own only | Own only |
| Submit own leave request | Yes | Own only | Own only, subject to policy |
| View all employees and attendance | Yes | No | No |
| Create/edit/archive accounts | Yes | No | No |
| Approve/reject leave | Yes | No | No |
| Process/confirm payroll | Yes | No | No |
| Change company settings | Yes | No | No |
| Read security audit events | Yes | No | No |

Only administrator authentication exists now. `regular` and `extra` are employee employment categories in current records, not authenticated account roles. Do not expose employee endpoints until employee credentials, ownership checks, and separate employee sessions are implemented.

## Audit logging

Important authentication events and every POST, PUT, PATCH, or DELETE business request are written to MongoDB collection `audit_events`. Records include time, actor ID/email/role, action, target, outcome, IP address, user agent, request ID, path, and HTTP status. Passwords, OTP codes, session tokens, CSRF tokens, and complete request bodies are deliberately excluded.

Recommended database controls:

- Permit append operations only from the application service identity.
- Restrict audit-log reads to authorized administrators.
- Add retention rules consistent with Philippine privacy and employment requirements.
- Export immutable copies to centralized logging for production incident response.

## Important terminal commands

Run these from the repository root:

```powershell
npm.cmd run build
npm.cmd audit --omit=dev
Set-Location backend
npm.cmd audit --omit=dev
npm.cmd run audit:security
```

`npm audit` checks third-party dependencies for published vulnerabilities. `npm run audit:security` prints only important WorkPulse application events from the last seven days. They are different from the persistent audit-log feature.

## Remaining deployment requirements

- Configure `MONGODB_URI`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `FRONTEND_ORIGIN`, and `NODE_ENV=production` securely.
- Terminate TLS at a trusted production proxy and ensure it sets `X-Forwarded-Proto`.
- Use a shared rate-limit store for multiple server instances.
- Create MongoDB TTL indexes for expired sessions, OTPs, and CAPTCHAs.
- Establish audit retention, backup, alerting, and incident-response policies.
- Conduct deployment-specific penetration testing before handling real payroll or biometric data.
