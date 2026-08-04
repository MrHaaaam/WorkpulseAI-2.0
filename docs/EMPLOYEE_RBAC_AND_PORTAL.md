# Employee RBAC and Portal

## Roles

- `admin`: full workforce, leave, payroll, settings, employee-account, archive, and audit authority.
- `regular`: employee portal access limited to the account's linked employee record.
- `extra`: the same employee-owned portal boundary; employment and payroll policies may differ from regular employees.

Employee ownership is derived from `employee_accounts.employeeId` on the authenticated server session. The client never supplies an employee ID for personal-data reads or leave submission.

## Employee capabilities

- View own profile and leave balances.
- View own recent attendance.
- View own payroll history.
- View own leave-request history.
- Submit a leave request for administrator review.
- Log out and revoke the current session.

Employees cannot view the admin dashboard, enumerate employees, view another employee, approve leave, process payroll, change settings, archive accounts, or access audit records.

## Collections

- `employees`: HR profile and employment data.
- `employee_accounts`: login email, hashed password, role, active state, and linked `employeeId`.
- `admin_accounts`: administrator login records.
- `admin_sessions`: shared opaque sessions for all account types; the historical collection name is retained for compatibility.

## Seed command

From the `backend` directory:

```powershell
npm.cmd run seed:employee:deocares
```

The command safely creates or updates the requested employee and login account without deleting other records.
