# Chapter 1: Introduction

## Background of the Study

Employee attendance and work information management is a vital component of organizational operations, as it directly affects productivity, accountability, and decision-making. Globally, organizations are increasingly adopting digital and analytics- driven human resource systems to replace manual and outdated attendance methods that often result in errors, inefficiencies, and limited access to actionable insights. Recent literature highlights that the integration of biometric-based system is revolutionizing human resource management by enhancing operational efficiency, minimizing labor-related inefficiencies, and eliminating the administrative burdens of traditional tracking methods (ljiga et al., 2025). Modern workforce analytics systems enable organizations to record attendance accurately, monitor work patterns, and generate data-driven reports that support effective human resource management. 

Despite these global advancements, studies reveal that many organizations still rely on disconnected or partly manual processes to manage employee information, attendance, leave, and payroll. These practices often result in inconsistent records, delayed approvals, limited employee transparency, inefficient reporting, and weak accountability. Basic systems may also lack appropriate authentication, authorization, audit logging, and protection for sensitive employee information, which can compromise employee trust and organizational credibility. Furthermore, traditional payroll and security systems such as manual logs or PIN codes contribute heavily to human error and unauthorized entry, explicitly highlighting the critical need for biometric verification to reduce proxy attendance practices like "buddy punching" (International Journal of Science and Research Archive, 2026). 

In the Philippine context, organizations are rapidly transitioning toward digital transformation in response to the growing demand for efficient, transparent, and technology-driven workplace systems. The Philippine HR technology market is experiencing significant growth as employers increasingly rely on cloud-based platforms and digital portals for faster, more efficient workforce processing (IMARC Group, 2025). This push for digitalization is evident even at the national level, with recent milestone initiatives like the Philippine Civil Service Modernization Project launched in late 2025, which seeks to harness digital tools to automate human resource and payroll systems for better efficiency and transparency (Civil Service Commission, 2025). 

However, many private and local organizations continue to face challenges such as fragmented attendance records, inefficient monitoring of work hours, and limited analytical capability. A centralized and secure workforce information management system is therefore needed to improve record management, administrative workflows, employee access, and data-supported decision- making. 

In response to these challenges, this study proposes WorkPulse, a secure web-based workforce information management system with integrated fingerprint-based attendance verification. The project aims to centralize employee, attendance, leave, and payroll records while providing strict role-based access organized into administrator and employee access groups. By utilizing a fingerprint scanner to verify employee identity during time-in and time-out, the system aims to associate biometric attendance records with the verified employee, improving identity assurance and operational integrity. Data is securely managed using a cloud-hosted MongoDB Atlas platform to support centralized, authorized data storage and access. This study aligns with Sustainable Development Goal (SDG) 8: Decent Work and Economic Growth by promoting fair labor practices, and SDG 9: Industry, Innovation, and Infrastructure by integrating digital analytics and secure hardware solutions into organizational process.

## Statement of the Problem

WorkPulse addresses employee information, attendance, leave, cash advance, and payroll processes that may be difficult to reconcile when maintained separately. Requirements were gathered through interviews. Usability was evaluated using the System Usability Scale (SUS), while functional behavior was examined through documented software tests. No separate workplace-challenges or system-quality survey was administered.

1. What workplace requirements and concerns were identified through interviews about attendance, employee information, leave, cash advances, and payroll?

2. How can WorkPulse centralize these records while providing administrator services and employee access to authorized personal information?

3. How can authorized manual attendance, corrections, notifications, and limited offline saving support the attendance workflow?

4. What level of perceived usability did WorkPulse obtain using the System Usability Scale?

5. How did the implemented attendance, payroll, authorization, and offline workflows perform in the documented functional tests?

## Objectives of the Study

The primary objective is to design, develop, and evaluate WorkPulse, a web-based employee attendance and work analytics information system for MVL. The system centralizes workforce records, provides administrator and employee services, and supports fingerprint attendance at the configured local workstation together with authorized manual attendance procedures.

1. To identify workplace requirements through interviews about employee information, attendance, leave, cash advances, and payroll.

2. To centralize employee, attendance, leave, cash advance, and payroll records using MongoDB Atlas.

3. To implement administrator and employee access groups with record ownership controls and Regular, Extra, and Manager / Supervisor employee classifications.

4. To provide an employee portal for authorized personal records, attendance, leave and cash advance requests, payroll summaries, and notifications.

5. To implement authorized attendance corrections with required reasons, correction history, employee notification, and protection of attendance included in settled payroll.

6. To generate descriptive workforce dashboards and reports and provide separately identified analytical insights for administrative review.

7. To implement limited offline saving and later synchronization of designated attendance actions, leave requests, and cash advance requests.

8. To evaluate perceived usability using SUS and verify selected business rules and error handling through documented software tests.

9. To integrate fingerprint-based time-in and time-out with the configured local workstation and document its operating requirements and evaluation limitations.

## Scope and Delimitation

WorkPulse provides administrator and employee access groups. Employees are classified as Regular, Extra, or Manager / Supervisor. Manager and supervisor represent one classification and share one company hourly-rate setting. These classifications do not create a separate management portal or confer administrator authority.

The system covers employee records, fingerprint attendance at a configured local kiosk, authorized administrator manual attendance, eligible attendance corrections, leave requests, cash advance workflows, payroll processing, personal payslip summaries, notifications, company settings, and audit logging. Attendance corrections retain a reason, administrator identity, timestamp, and history. Server validation protects records included in paid, settled, or carried payroll.

Cash advance management distinguishes request approval from confirmation that cash was given. Confirmed disbursements establish outstanding balances; recorded repayments reduce those balances. Carried payroll balances are unpaid employee earnings transferred between payroll statements and are distinct from outstanding cash advance debt. The system records settlement; it is not integrated with a bank or payment gateway.

Descriptive dashboards summarize stored workforce events and totals. The application also includes statistical forecasting, attendance-risk indicators, and arrival anomaly analysis for administrative review. Their presence does not establish measured forecasting accuracy, and their outputs do not directly measure individual productivity or automatically determine disciplinary actions.

Limited offline operation uses a prepared browser and a valid existing session. Eligible manual attendance/corrections, leave requests, and cash advance requests may be queued locally, and selected previously cached information may be viewed. Employee requests synchronize on reconnection after session validation; attendance synchronization requires administrator password confirmation. All synchronized actions remain subject to current server rules.

Fingerprint capture and matching require a compatible reader, locally installed components, and a Windows workstation running the local matching workflow. The scanner is not directly attached to the remote Render backend. Fingerprint attendance, fresh login, approvals, payroll settlement, and cash-given confirmation require their online services. Browser storage may fail or be cleared, and cached information may be outdated.

Research data gathering consisted of interviews for requirements and SUS for usability. No separate questionnaire produced workplace-problem frequencies or security, performance-efficiency, and reliability ratings. Functional results describe the tested local application and controlled browser environment. Physical fingerprint accuracy, live deployment recovery, and forecasting accuracy are not established by those software tests.

## Significance of the Study

Administrators and Management. Centralized records, attendance history, request processing, and payroll summaries support review and reduce repeated record reconciliation. Traceable corrections provide accountability when manual adjustments are required.

Employees. The employee portal provides access to authorized attendance, leave, cash advance, and payroll information. Notifications improve visibility of changes affecting an employee’s records.

IT Practitioners and Developers. The project demonstrates browser interfaces, cloud record storage, hardware-dependent attendance integration, server authorization, and limited offline synchronization within one application.

Future Researchers. WorkPulse provides a basis for further usability, biometric, outage-recovery, and analytical evaluation using documented methods and measured outcomes.

## Definition of Terms

Attendance Correction. An authorized modification of eligible attendance, retained with its reason, administrator identity, timestamp, and history.

Attendance Monitoring. Viewing attendance dates, statuses, and recorded work sessions.

Audit Logging. Recording significant administrative and security activities for review and accountability.

Authentication. Verifying an account before permitting access to WorkPulse.

Authorization. Restricting operations and records according to authenticated permissions and ownership.

Biometric Identification. Comparing a captured fingerprint against enrolled reference templates to identify an employee in the local attendance workflow.

Carried Payroll Balance. Unpaid employee earnings transferred from an earlier payroll period into a subsequent payroll statement.

Cash Advance. An employee request for an advance, subject to review, cash-given confirmation, outstanding-balance tracking, and repayment.

Cloud Database. Remote record storage used by WorkPulse through MongoDB Atlas.

Dashboard. A presentation of workforce indicators, tables, and charts.

Data Validation. Checking input and synchronized actions against required formats and business rules.

Descriptive Analytics. Summarizing recorded information without presenting the summary itself as a forecast.

Employee. An authenticated member of the employee access group, classified as Regular, Extra, or Manager / Supervisor.

Employee Notification. A system-generated notice about relevant recorded events, administrative changes, or request decisions.

Employee Portal. The employee interface for personal workforce records, requests, summaries, and notifications.

Encryption. Transforming data to protect it against unauthorized disclosure.

Fingerprint Scanner. The supported local reader that captures fingerprint samples.

Fingerprint-Based Attendance. Recording time-in or time-out following identification using the configured reader and matching components.

Leave Management. Submission, review, approval or rejection, and recording of employee leave requests.

Manager / Supervisor. One employee classification, alongside Regular and Extra, that does not automatically confer administrator access.

MongoDB Atlas. The cloud-hosted database platform used for WorkPulse workforce records.

Offline Queue. Account-specific local storage of supported actions awaiting server acceptance.

One-Time Password. A temporary email verification code used in an applicable authentication step.

Outstanding Cash Advance Balance. Confirmed cash advances remaining unpaid after recorded repayments.

Payroll Management. Preparation, review, carry-forward, and settlement recording of employee earnings and deductions.

Payslip Summary. A display of current earnings, deductions, carried earnings, and the resulting payout.

Role-Based Access Control. Server-side restrictions based on authenticated account permissions and employee-record ownership.

Session Management. Creating, validating, expiring, and terminating authenticated access.

Synchronization. Submitting locally queued actions for server validation and reconciliation after connectivity returns.

System Usability Scale. The ten-item questionnaire used in this study to evaluate perceived usability on a score from 0 to 100.

Time-In and Time-Out. Recorded beginning and ending work times, entered through supported fingerprint attendance or authorized manual attendance.

WorkPulse. The employee attendance and work analytics information system developed for MVL.
