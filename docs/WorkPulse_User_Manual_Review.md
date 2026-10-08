# WorkPulse user manual review

Reviewed: October 7, 2026. Original: `WorkPulse_User_Manual.pdf` (two pages).

This review compares the manual with the current frontend and backend source. It does not certify the version running on Render/Vercel or a connected fingerprint reader. The original PDF was left unchanged.

## Assessment

The manual is broadly accurate as a quick-start overview. It is not yet a complete user manual. Some navigation labels differ from the actual UI, and several operational steps and limitations are missing.

## Review of all twelve workflows

| Section | Finding | Recommended correction or addition |
| --- | --- | --- |
| 01 Sign in securely | Normal accounts use email and password, then email OTP. CAPTCHA is missing. Not every account requires OTP. | Add “Solve the math CAPTCHA before signing in.” Describe OTP as applying to standard accounts; administrator-authorized test accounts can bypass it. Do not publish their passwords in a general manual. Add first-login password replacement where prompted. |
| 02 Manage employees | Create, edit, archive, and restore are supported. The menu label is different. | Replace “Employee Information” with “Employee Directory.” Explain that restoring archived records is available through Admin Controls → Archive and does not mean every account-access restriction is automatically removed. |
| 03 Record attendance | Kiosk scanning, employee identification, and server timestamps are supported. | Explain enrollment and the locally configured reader/WebSDK requirement. Wait for the successful saved-event message. Time-in or time-out is selected automatically; lifting the finger prevents unintended repeat scans. A phone displaying the portal is not automatically a fingerprint kiosk. |
| 04 Monitor attendance | Attendance review and date filtering are supported. | Use the actual sidebar label “Attendance.” Explain multiple sessions, incomplete sessions, late arrivals, leave, idle days, and administrator corrections. Do not treat every missing record as a confirmed absence. |
| 05 Manage leave | Employee requests and admin decisions are supported, but the description is too brief. | State that up to ten separate selected days are allowed per request and dates need not be consecutive. Explain included/excluded dates, past-date correction, blocked conflicts, and Undo Approval. “Personal leave requests” should mean the employee's own requests, rather than only the Personal Leave type. |
| 06 Process payroll | Review, calculation, balances, and printing are supported. Email endpoints exist on the backend, but the current Payroll UI does not expose a send-email action. | Replace the flow “PAYROLL → REVIEW → SEND” with “PAYROLL → REVIEW → CONFIRM PAYMENT.” Replace “Print or email payroll summaries” with “View or print payslips; export payroll records.” Do not instruct users to click an email action absent from the UI. Marking paid records a payment; it does not transfer money to a bank or wallet. |
| 07 View payroll summary | Employees can view payroll history and details. | Add “Select View summary to review or print your payslip.” Explain paid, ready-to-pay, carried balance, and payment hold. |
| 08 Check analytics | Counts, charts, forecasts, and risk information are supported. The decision-support caution is appropriate. | Use the visible labels: Overview for summary charts, Insights for analysis and forecasts. Keep the warning against using insights as the sole basis for employment decisions. |
| 09 Use employee portal | Own profile, attendance, leave, and payroll are supported; access to other employees' protected records is restricted. | Add My Calendar, cash advance requests, pending leave cancellation, contact-information editing, and employee password recovery. |
| 10 Manage settings | Authorized admins can save company preferences. | Use the label “System Settings.” Mention workdays, working hours, schedule overrides, and payroll preferences. Explain that settings can affect future calculations; users should review the confirmation shown by the app. |
| 11 Review audit activity | Audit activity exists, but there is no separate Audit Log sidebar entry. | Direct users to Overview → Audit Trail. Explain dates, recorded actions, and success/failure outcomes. An attempt is not necessarily a successful database change. |
| 12 Log out safely | Both roles can log out, but the described account-menu flow is not universal. | Admin: use Log out in the header or sidebar and confirm. Employee: use the sidebar logout icon; the current employee flow does not show the same confirmation dialog. Wait for the sign-in page. |

## Suggested additions

### Leave instructions

1. Open Leave Requests in your employee portal.
2. Choose a leave type and select one to ten scheduled dates. Dates can be nonconsecutive.
3. Enter a reason and submit the form. The administrator can see the submission date in Philippine time.
4. An administrator opens the request, reviews the selected dates, and excludes any dates that should not be approved.
5. Past dates need an explicit correction confirmation and reason. Dates with recorded work, overlapping approved leave, nonworking schedules, or paid/settled payroll conflicts cannot be approved through this correction flow.
6. Eligible approved dates appear as OnLeave; recorded work is not overwritten by this approval flow.
7. Unselected dates are not approved; the request is completed with the selected approval dates. Review the confirmation list before proceeding.
8. Undo Approval keeps past approved dates and reverses only current/future approved dates. Read the displayed dates and result before confirming.

### Payroll instructions

- Review completed attendance and missing time-outs before preparing payroll.
- Review additions, cash advance deductions, carried balance, and amount due.
- Confirm the actual payment outside WorkPulse before marking a record as paid.
- A payment hold means payroll payment is paused; it is not an employee leave rejection.
- Carrying an amount to the next period does not mean it has been paid.
- Undo payment only when funds were not sent or have been returned; provide the required reason and administrator password.
- Printing a payslip and exporting records do not transfer funds.

### Exports and backups

- Admin Controls → Excel reports downloads formatted `.xlsx` workbooks for employees, attendance, leave, and payroll.
- Some page-level exports, including Payroll export, still use `.csv`; do not say every export is XLSX.
- XLSX and CSV can be opened in Excel on a phone. CSV does not retain workbook formatting.
- Exported leave information distinguishes requested and approved dates; a start/end range alone does not describe nonconsecutive requests.
- Report exports are not database backups. The business-data backup is a separate JSON download. Do not promise a restore button unless one is available in the shipped UI.

### Access and troubleshooting

- New employees may need to replace their temporary password before entering the portal.
- Employee Forgot password uses an email verification/reset flow.
- Sessions have a five-hour maximum. Sidebar navigation and browser Back within the portal retain the session; reaching the sign-in page through history ends it.
- On small screens, open the sidebar using the menu button.
- An administrator may need to verify their password for protected controls and sensitive actions.
- If OTP fails, check the registered email and mail folders, then ask the administrator to check email delivery configuration. An approved OTP-bypass test account is a specific exception.
- If the fingerprint reader is unavailable or a scan is rejected, follow the displayed instruction and ask the supervisor about authorized manual attendance. A denied scan is not proof attendance was saved.
- For production deployment verification, test login, reader recognition, saved attendance, leave decisions, payroll calculations, exports, and logout on the actual deployed version.

## Suggested presentation

Keep the existing two-page design and label it “Quick-start guide.” Add separate illustrated pages for employee onboarding, fingerprint enrollment, leave review, payroll statuses, cash advances, export instructions, and troubleshooting if a full user manual is required. Use screenshots with sample records and redact real employee details.

## Main source files checked

- `src/components/LoginSplitPage.tsx`, `backend/src/routes/auth.js`, `backend/src/otp-bypass-accounts.js`
- `src/components/AdminSidebar.tsx`, `src/views/EmployeeDirectoryView.tsx`, `src/views/AdminView.tsx`
- `src/views/AttendanceKioskView.tsx`, `backend/src/routes/api.js`
- `src/views/LeaveRequestsView.tsx`, `src/components/LeaveDatePicker.tsx`, `backend/src/leave-approval.js`, `shared/leave-policy.js`
- `src/views/PayrollView.tsx`, `src/views/EmployeePortal.tsx`, `src/views/EmployeeCashAdvancePanel.tsx`
- `src/views/AdminOverviewView.tsx`, `src/views/AIInsightsView.tsx`, `src/views/SettingsView.tsx`
- `src/routes/AppRoutes.tsx`, `src/App.tsx`, `backend/src/security.js`
