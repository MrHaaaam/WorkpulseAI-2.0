# Real accounts with OTP bypass

The backend creates `admin@gmail.com` / `admin123` and `employee@gmail.com` / `employee123` in its normal MongoDB database on startup. These are real accounts; their permitted actions affect company records. CAPTCHA and password checks still apply. OTP is skipped only when the account has `otpBypass: true` and matches the exact email and role allowed by the backend.

Deploy the updated backend and frontend to the existing Render and Vercel services. No demo settings, separate ports, or additional databases are needed. Restart the local backend on port 5000 to use the updated login behavior on localhost:5173. Existing accounts with these emails are never silently overwritten. Existing provisioned passwords are never reset on restart.

The employee account links to a regular employee profile named Test Employee, initially with a zero hourly rate. Change its profile through normal admin controls if needed. All other accounts retain OTP login.

To disable OTP bypass for either account, set its `otpBypass` field to false and remove it from the provisioning list before the next restart. To revoke access immediately, set `active` to false and delete its sessions. The supplied passwords are deliberately simple as requested; change them through the normal password controls when testing is complete.
