# WorkpulseAI

WorkpulseAI brings employee records, attendance, leave requests, cash advances, and payroll into one place. Administrators can manage day-to-day records, while employees can check their own information and submit requests through the employee portal.

This submission contains the application source code. It does not include the owner's database, employee records, database backups, or private service credentials. To run it, you will need a separate MongoDB database that you control. Please use fictional records when reviewing the system.

## What you can explore

- Employee profiles and account management.
- Attendance recording, corrections, and an attendance kiosk.
- Leave requests and administrator approval.
- Cash advance requests and payroll preparation.
- Attendance insights and biometric evaluation summaries.
- Notifications, spreadsheet exports, record archives, and backup tools.
- Offline support for cached pages and selected queued operations.

Offline support needs an initial connection and does not replace the backend or database. The insights are calculated from application records; there is no separate Python AI service to start in this submission.

## How the project is organized

| Location | What it contains |
| --- | --- |
| `src/` | React pages, components, and browser-side logic |
| `public/` | Static files and the DigitalPersona browser SDK |
| `backend/src/` | Express API, authentication, database operations, and tests |
| `backend/scripts/` | Local fingerprint matching helper |
| `shared/` | Rules used by both the browser and backend |
| `scripts/` | Test and verification tools |

The frontend uses React, TypeScript, Vite, and Tailwind CSS. The backend uses Node.js, Express, and MongoDB through Mongoose and the MongoDB driver. Fingerprint capture uses DigitalPersona, with native matching on a compatible Windows setup.

## Before you begin

Use Node.js 22.20 or newer and npm. The project was prepared with Node.js 22.20.0. You will also need a running MongoDB instance. For local review, a recent MongoDB 7 or 8 installation configured as a replica set is a practical choice: payroll operations use database transactions. An appropriately configured MongoDB Atlas database of your own is another option.

You do not need the original database or its password. Start with an empty review database. The backend creates indexes and test accounts when it starts, so only point it at a database intended for this review.

## Run it locally

Open a terminal in the extracted project folder and install both sets of dependencies:

```powershell
npm ci
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
```

Open `backend/.env` and set `MONGODB_URI` to your own database. The example uses `mongodb://127.0.0.1:27017/workpulse_review`. Replace the biometric encryption placeholder with a private random value. You can generate one with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep that encryption value stable for the database you are using; changing it can prevent existing fingerprint templates from being read.

Start the API in one terminal:

```powershell
npm --prefix backend run dev
```

In another terminal, start the frontend:

```powershell
npm run dev
```

Open `http://localhost:5173`. The frontend forwards `/api` requests to `http://localhost:5000`. Keep both terminals running. You can check the API at `http://localhost:5000/api/health`.

## Review accounts

On an empty database, the current backend automatically creates these test accounts:

| Access | Email | Password |
| --- | --- | --- |
| Administrator | `admin@gmail.com` | `admin123` |
| Employee | `employee@gmail.com` | `employee123` |

These are built-in review credentials, not credentials for the owner's database. They bypass email OTP and should be used only in an isolated local review. The employee account starts with a fictional profile and no attendance or payroll history. Complete the CAPTCHA shown on the login screen, then sign in with the appropriate account.

To try the main workflow, sign in as the administrator, add fictional employees, record attendance, review a leave or cash advance request, and explore payroll and exports. You can then sign in as an employee to explore the employee portal. Screens that depend on historical records will remain empty until you add data.

Do not deploy the built-in test accounts to a public service. A public deployment needs a separate account provisioning and authentication review.

## Configuration

The backend reads `backend/.env`. The submission includes only `.env.example` so you can supply your own settings.

| Setting | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string for your own review database |
| `PORT` | API port; defaults to `5000` |
| `FRONTEND_ORIGIN` | Allowed browser origin; use `http://localhost:5173` locally |
| `NODE_ENV` | Use `development` for local review |
| `BIOMETRIC_ENCRYPTION_KEY` | Private value used to protect stored fingerprint templates |
| `APP_URL` | Frontend address used in account emails |
| `EMAIL_PROVIDER` | `gmail` or `brevo`, if email features are needed |
| `SMTP_USER`, `SMTP_APP_PASSWORD` | Your own Gmail sender and app password |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Your own Brevo sender settings |

Email delivery is optional for the two review accounts. Regular account login uses email OTP, and password resets, verification messages, and emailed payslips require a configured sender. Leaving email credentials blank does not simulate successful delivery.

## Fingerprint requirements

Fingerprint enrollment and matching need a compatible reader, the DigitalPersona local software and drivers, and the HID FingerJet runtime on Windows. The matching helper expects `C:\Windows\System32\dpfj.dll`. These native components and a physical reader are not included in the ZIP. Without them, you can inspect the code and explore other application features, but you cannot perform a real fingerprint scan.

## Database overview

The database stores employee profiles, employee and administrator accounts, attendance, leave requests, payroll requests, cash advances, notifications, audit events, and biometric templates. Supporting collections hold sessions, verification codes, and queued operation records. The collection access and field handling live in `backend/src/`, mainly in the route modules.

This is a source-code submission, not a database export. No original employee, payroll, attendance, or fingerprint records are supplied. Backup and restore features operate on whichever database you configure; use only disposable review data when trying them.

## Build and verification

From the project root:

```powershell
npm run build
npm test
npm run test:api
```

The build checks TypeScript and generates the frontend in `dist/`. The unit and API tests use test fixtures; they are different from a full review against a running MongoDB instance and physical fingerprint hardware. Browser audit commands in `package.json` may need additional browser tooling and running application services.

`npm run preview` previews the compiled frontend. For a working local application with API forwarding, use the development setup above. Hosting the frontend alone does not host the API. The submission does not include a rewrite pointing to the owner's live backend.

## If something does not work

- **The API stops at startup:** check that MongoDB is running, the connection string is correct, and the database user can create the required indexes.
- **A payroll operation fails with a transaction error:** check that your MongoDB deployment supports transactions; a standalone MongoDB server is insufficient for those operations.
- **The browser cannot load records:** keep the API running on port `5000` and open the frontend on port `5173`. If Vite chooses another port, update `FRONTEND_ORIGIN` accordingly.
- **An email action fails:** provide your own sender credentials. The built-in review accounts can log in without email, but other email workflows still need configuration.
- **Fingerprint capture is unavailable:** check the reader, local DigitalPersona service, Windows drivers, and native matching runtime.
- **A page is empty:** the review database begins without the owner's records. Add fictional data through the application.

## About the submission ZIP

The clean submission keeps application source, dependency lockfiles, required assets, tests, and this README. Local environment files, installed dependencies, build output, Git history, editor and agent files, caches, database backups, and personal maintenance or seed scripts are excluded. Install dependencies after extracting the ZIP rather than copying an existing `node_modules` folder.

All project documentation is kept here so reviewers have one place to start.
