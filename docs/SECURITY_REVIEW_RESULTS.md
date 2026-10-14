# Security changes and verification

Review date: October 12, 2026 (Asia/Manila).

## Changes

- CAPTCHA and login OTP identifiers must be bounded strings; OTPs must be six-digit strings. Objects containing MongoDB operators cannot enter those query fields. Payroll preparation also validates employee IDs before querying.
- Login OTPs are consumed atomically before a session is created. A simultaneous or repeated exchange cannot create another session.
- Password recovery checks identifier and token types, permits one successful code exchange, and claims a reset token before changing credentials. If storage fails after a token is claimed, request a fresh recovery code rather than reusing it.
- Rate budgets use IP addresses rather than user-supplied emails. Expired buckets are periodically removed and each limiter has a bounded number of tracked addresses. Limits: general API 600/minute, login 30/minute, CAPTCHA 20/minute, login OTP 10/10 minutes; password-recovery limits remain enforced. Fingerprint matching routes have a 30/minute budget.
- The general API limiter runs before JSON parsing. These limits are process-local and reset on restart; they are not distributed abuse or DDoS protection. Production proxy forwarding must be verified, especially through both Vercel and Render. A shared store is required before relying on limits across multiple instances.
- Updated backend `proxy-addr` to 2.0.8. Added compatible frontend overrides for `source-map-js` 1.2.2 and ExcelJS's `uuid` dependency (11.1.1 range). No forced ExcelJS downgrade was used.
- Added Vercel response configuration for MIME sniffing protection, frame denial, and no-referrer. This configuration requires deployment and live header verification.
- Tester account provisioning and OTP bypass remain unchanged at the user's instruction.

## Verified scope

`backend/src/security-regression.test.js` exercises the actual Express authentication and business routers through localhost HTTP. Database collections use controlled in-memory records; email provider calls are intercepted and return simulated acceptance. These tests do not send real emails, use Atlas, or access real employee records.

The checks cover normal password/CAPTCHA login and mocked OTP issuance, incorrect credentials, malformed identifiers, invalid/expired OTPs, concurrent OTP exchange and replay, cookie flags, CSRF rejection, logout revocation, employee authorization and notification ownership, password recovery, first-login password changes, payroll identifier validation, fingerprint route throttling, encrypted template tamper detection, and Excel workbook generation.

The browser smoke script uses isolated Edge, actual IndexedDB and service-worker caching, and mocked API responses. Its owner-identifier check is not a complete different-account login test or independent-tab session test.

Evidence files:

- `tools/security-auth-results.log`
- `tools/security-backend-results.log`
- `tools/security-browser-results.log`
- `tools/security-build-results.log`
- `tools/security-frontend-audit.json`
- `tools/security-backend-audit.json`

## Database and live deployment limits

Existing code hashes passwords using scrypt, stores session token digests, encrypts biometric templates with AES-256-GCM, checks roles and record ownership, and supplies backup/recovery tools. The application accesses MongoDB from the backend rather than distributing the database connection string to browser code.

Atlas network access, database-user roles, production environment variables, TLS behavior, index creation, backup retention, recovery against a real database, and actual email delivery were not independently checked. Configure a database-scoped application user and appropriate network access, and verify `NODE_ENV=production` and the frontend origin. Keep secrets outside source control and browser builds.

Biometric encryption currently falls back to connection-string-derived key material if `BIOMETRIC_ENCRYPTION_KEY` is unset. Preserve the current key material securely for recovery. Changing it without re-encrypting existing templates will make them unreadable; this review does not rotate keys or migrate stored templates.

Zero npm advisories is a dependency scan result, not proof that the application has no vulnerabilities. Passing controlled tests does not establish physical scanner performance, live payroll correctness, production recovery, or complete injection/spam protection. No deployment or live database changes were performed.
