# WorkPulseAI Research Paper Revision Guide

## Purpose of this guide

This document is a guide for rewriting the old WorkPulse research paper so that it accurately reflects the current system. It separates features that are already implemented from features that are still proposed, especially fingerprint-scanner integration and advanced AI analytics.

Do not claim that a feature is working, tested, accurate, or secure unless it has been implemented and evaluated with evidence.

## Main recommendation

Create a new version of the paper using the old paper as a foundation. The general research problem remains useful, but the system description, objectives, scope, terminology, diagrams, and evaluation plan must be updated.

The safest direction is to present WorkPulseAI as a secure web-based workforce information management system with planned biometric attendance integration.

## Recommended working title

### Recommended title while the scanner is unavailable

**WorkPulseAI: A Secure Web-Based Employee Attendance, Leave, Payroll, and Workforce Information Management System with Proposed Fingerprint Verification**

### Shorter alternative

**WorkPulseAI: A Secure Web-Based Workforce Information Management System**

### Title to use after fingerprint integration is completed and tested

**WorkPulseAI: A Secure Web-Based Workforce Information Management System with Fingerprint-Based Attendance Verification**

Avoid placing “fingerprint-based attendance verification” in the title as an implemented capability until the scanner captures fingerprints and the system makes real identity-match decisions.

## Current system truth

### Implemented or substantially implemented

- Secure administrator and employee login
- CAPTCHA and email OTP authentication flow
- Session management and logout
- Administrator and employee role-based access control
- Employee information management
- Employee account creation and administration
- Employee archive and restoration functions
- Employee self-service portal
- Attendance-record viewing and descriptive summaries
- Leave-request submission, approval, and rejection
- Leave-balance information
- Payroll requests and payroll-record management
- Payroll confirmation and rejection workflows
- Payroll summary email function
- Company, attendance, leave, and payroll settings
- Automatic clock-out processing for existing open attendance records
- Administrative dashboards and descriptive charts
- Audit-event recording
- CSRF protection, request validation, rate limiting, and security headers
- Responsive layouts for desktop and smaller screens
- MongoDB-based centralized data storage

### Partially implemented or demonstration only

- Biometric enrollment is represented by an employee status such as `enrolled`, `pending`, or `none`.
- Attendance analytics calculate descriptive totals, rates, and trends from stored records.
- The AI Insights page explains possible analytical methods but does not execute validated AI models.
- The attendance module displays stored attendance but does not yet provide a complete fingerprint kiosk clock-in/clock-out workflow.

### Not yet implemented

- Physical fingerprint-scanner communication
- Fingerprint image or template capture
- Fingerprint template storage and protection
- Actual fingerprint matching or verification
- Scanner-based time-in and time-out
- Biometric match confidence scores
- False Acceptance Rate and False Rejection Rate evaluation
- An operational attendance kiosk connected to biometric hardware
- Executed and validated Holt-Winters forecasting
- Executed and validated anomaly-detection models
- Validated AI-generated employee risk scores
- Fully offline operation using a local database and local authentication services

## How to describe the unavailable scanner

### Safe wording

> Fingerprint-based attendance verification is included in the planned architecture of WorkPulseAI. At the current development stage, the system records an employee's biometric enrollment status but does not yet capture or match fingerprint templates because the required scanner hardware has not been acquired. Hardware integration and biometric performance evaluation will be conducted in a subsequent development and testing phase.

### Wording to avoid for now

- “The fingerprint scanner verifies every employee.”
- “The system prevents buddy punching through biometric authentication.”
- “Fingerprint attendance is accurate.”
- “Employees perform time-in and time-out using their fingerprints.”
- “The system achieved a biometric accuracy of 95%.”
- Any claimed FAR, FRR, precision, recall, or F1 score without actual test results

## Proposed Chapter 1 direction

### Background of the Study

The revised background should discuss these connected problems:

1. Fragmented employee, attendance, leave, and payroll records
2. Slow administrative processing and reporting
3. Employees' limited access to their own records
4. Weak access control and accountability in basic workforce systems
5. The risk of proxy or unauthorized attendance recording
6. The potential value—and privacy risks—of future biometric verification

Explain that the present system addresses centralized management, employee self-service, workflows, descriptive analytics, and security. Present fingerprint integration as the next development phase.

Do not state that WorkPulseAI measures employee productivity unless the system records and evaluates actual work-output indicators.

### Suggested general problem

Many organizations manage employee information, attendance, leave, and payroll through disconnected or partly manual processes. These practices may result in inconsistent records, delayed approvals, limited employee transparency, inefficient reporting, and weak accountability. Basic systems may also lack appropriate authentication, authorization, audit logging, and protection for sensitive employee information. A centralized and secure workforce information management system is therefore needed to improve record management, administrative workflows, employee access, and data-supported decision-making. Biometric attendance verification may further improve identity assurance, but it requires hardware integration, privacy safeguards, and formal performance evaluation.

### Suggested research questions

1. What challenges are encountered in managing employee information, attendance, leave, and payroll through current manual or fragmented processes?
2. What functional and security requirements should WorkPulseAI provide for administrators and employees?
3. How can the system centralize workforce records and support attendance monitoring, leave processing, payroll workflows, and employee self-service?
4. How acceptable is the developed system in terms of functional suitability, usability, performance efficiency, reliability, and security?
5. After hardware integration, how accurately and reliably does fingerprint verification authenticate employee attendance?

Question 5 should be marked as a future evaluation question or removed from the current study if the scanner will not be available before the research evaluation.

### Suggested general objective

To design, develop, and evaluate a secure web-based workforce information management system that centralizes employee, attendance, leave, and payroll records; provides role-based administrator and employee services; and prepares the system architecture for future fingerprint-based attendance verification.

### Suggested specific objectives

1. Identify problems and requirements in existing employee information, attendance, leave, and payroll processes.
2. Develop a centralized web-based system for employee records, attendance monitoring, leave management, and payroll workflows.
3. Implement separate administrator and employee access based on authenticated roles and record ownership.
4. Provide an employee portal for viewing personal information, attendance, payroll, and leave records and for submitting leave requests.
5. Implement appropriate security controls, including authentication, authorization, session management, request protection, input validation, and audit logging.
6. Generate descriptive dashboards and reports from stored workforce records.
7. Evaluate the system using defined software-quality criteria and test procedures.
8. Design the integration and evaluation plan for fingerprint-based attendance verification as a future phase.

If the scanner is acquired and integrated before the final evaluation, Objective 8 may be changed to:

> Integrate and evaluate fingerprint-based time-in and time-out verification using measured biometric performance and usability results.

## Recommended scope

The study covers the design and development of WorkPulseAI as a responsive web-based workforce information management system. Its current scope includes administrator and employee authentication, role-based access, employee information management, employee self-service, attendance-record monitoring, leave-request processing, payroll workflows, settings, descriptive dashboards, and security audit events. Data is stored in a centralized MongoDB database.

The system's biometric module currently maintains enrollment readiness information. Actual fingerprint acquisition, template processing, biometric matching, and scanner-based attendance will be included only after compatible hardware and its software development kit or communication protocol become available.

## Recommended delimitations

- WorkPulseAI does not currently capture or verify fingerprints.
- Biometric accuracy, FAR, FRR, and matching speed are not evaluated in the current version.
- Attendance records can be managed and viewed, but the complete biometric kiosk workflow is outside the current implemented scope.
- AI Insights currently presents proposed analytical methods; it must not be treated as a validated decision-making model.
- The system provides workforce-record analytics, not a complete measurement of employee productivity or work quality.
- The system does not currently define separate HR, manager, or team-leader account roles; its authenticated roles are administrator, regular employee, and extra employee.
- The deployed system depends on its configured server, MongoDB database, and email service. It should not be described as fully offline unless a local offline deployment is created and tested.
- Mobile access depends on network deployment and browser compatibility. The interface is responsive, but responsiveness does not guarantee public mobile access.
- Security controls reduce identified risks but do not prove that the system is completely secure.

## Significance of the Study

### Organizations and administrators

WorkPulseAI may help centralize workforce records, reduce repetitive administrative work, improve record visibility, and support attendance, leave, and payroll monitoring.

### Employees

Employees may view their own authorized records and submit leave requests through a self-service portal, improving transparency and reducing dependence on manual inquiries.

### System administrators and developers

The project demonstrates authentication, authorization, audit logging, validation, and other controls relevant to workforce-information systems.

### Future researchers

The system may provide a foundation for studies involving biometric attendance, workforce analytics, privacy-aware HR systems, and the evaluation of AI-assisted administrative tools.

## Terms that should be added or revised

- **Audit Trail:** A record of important system and user actions used for accountability and security review.
- **CAPTCHA:** A challenge used to reduce automated login attempts.
- **Descriptive Analytics:** The summarization of historical data through counts, rates, tables, and charts without predicting future outcomes.
- **Employee Portal:** A role-restricted interface through which an employee accesses only the employee's authorized records and services.
- **Multi-Factor Authentication:** Authentication requiring more than one form of verification, such as a password and email OTP.
- **One-Time Password:** A temporary code used for an authentication attempt.
- **Role-Based Access Control:** Access restrictions determined by an authenticated user's assigned role.
- **Session Management:** The creation, validation, expiration, and revocation of authenticated user sessions.
- **Workforce Information Management:** The organized storage and processing of employee, attendance, leave, payroll, and related organizational records.
- **Biometric Enrollment Status:** A system indicator showing whether biometric enrollment is pending, absent, or recorded as completed. In the current version, it does not prove that a real fingerprint template was captured.

Do not define WorkPulseAI as performing fingerprint verification until that process exists in the working system.

## Evaluation plan for the current system

Use a recognized framework such as ISO/IEC 25010 and select only characteristics relevant to the study.

### Functional suitability

- Verify administrator and employee login flows.
- Verify that employees can access only their own information.
- Test employee creation, editing, archiving, and restoration.
- Test leave submission, approval, and rejection.
- Test payroll creation, confirmation, rejection, and summary delivery.
- Test attendance retrieval and dashboard calculations.
- Compare actual outcomes with expected test cases.

### Usability

- Ask representative administrators and employees to complete realistic tasks.
- Measure task completion, time, errors, and satisfaction.
- Use a defined questionnaire such as the System Usability Scale if permitted by the adviser.

### Performance efficiency

- Measure response time for login, lists, dashboards, record creation, and reports.
- State the number of records and hardware/network conditions used during testing.

### Reliability

- Test invalid data, expired sessions, incorrect credentials, unavailable database conditions, and repeated requests.
- Record whether the system fails safely and presents understandable errors.

### Security

- Verify authentication and role restrictions.
- Verify that employees cannot retrieve another employee's records.
- Test CSRF enforcement on cookie-authenticated state-changing requests.
- Verify session expiration and logout.
- Test rate limiting, request validation, and protected administrative operations.
- Review audit events for important actions.
- Do not use a user-satisfaction survey alone as proof of security.

### Current code-quality note

The production build currently succeeds, but linting reports errors and warnings. Resolve these before the final technical evaluation and include build, lint, functional, and security-test results in the paper's testing chapter.

## Fingerprint phase after purchasing the scanner

### Before purchasing

Confirm that the device provides:

- A documented SDK or API compatible with the project's operating system
- Support for browser, local service, or backend integration
- Fingerprint enrollment and one-to-one or one-to-many matching
- Access to match results and confidence scores
- Licensing terms suitable for research and deployment
- Device drivers that remain supported
- Documentation for template format and storage requirements

A USB scanner cannot usually be controlled directly by a normal web page without a vendor SDK, browser bridge, WebUSB support, or a locally installed device service.

### Integration stages

1. Create a local scanner service or use the vendor SDK.
2. Enroll fingerprints with informed consent.
3. Convert scans into protected templates where supported.
4. Avoid storing raw fingerprint images unless scientifically necessary and formally approved.
5. Bind each template to the correct employee record.
6. Add kiosk endpoints for verified time-in and time-out.
7. Prevent repeated or impossible clock events.
8. Record device, timestamp, result, threshold, and audit information.
9. Provide an authorized fallback when a fingerprint cannot be captured.
10. Test privacy, deletion, backup, failure recovery, and access restrictions.

### Biometric evaluation requirements

- Obtain informed consent and follow the institution's ethics and privacy requirements.
- Record genuine attempts and controlled impostor attempts.
- Separate enrollment samples from evaluation samples.
- Document scanner model, firmware, SDK version, matching threshold, and conditions.
- Report the confusion matrix and sample size.
- Calculate False Acceptance Rate and False Rejection Rate.
- Report precision, recall, F1, and accuracy where appropriate.
- Measure verification time and failed-capture rate.
- Never invent biometric results before testing.

## AI terminology recommendation

Until an actual model runs on system data, use **descriptive workforce analytics** for the implemented dashboards and **proposed advanced analytics** for Holt-Winters forecasting, anomaly detection, and scanner-health calculations.

Do not call the Bradford Factor an AI model. It is a rule or HR indicator. Any future risk output should support human review and must not automatically discipline an employee or deny payroll.

## Architecture description for the new paper

The current high-level architecture can be described as:

```text
Administrator or employee browser
              |
              | authenticated web requests
              v
       React web application
              |
              | protected API requests
              v
        Express backend API
          |             |
          v             v
      MongoDB       Email service

Future fingerprint phase:

Fingerprint scanner
       |
       v
Vendor SDK or local device service
       |
       v
Verified attendance API and audit record
```

Update this diagram after the final hosting platform and scanner integration method are known.

## Research evidence checklist

- Identify the target organization or intended deployment context.
- Describe its present attendance, employee-record, leave, and payroll workflows.
- Gather baseline evidence through interviews, observation, questionnaires, or existing records.
- State the respondent groups and sampling method.
- Add recent peer-reviewed and authoritative sources.
- Support Philippine-context claims with appropriate local or government sources.
- Discuss the Data Privacy Act of 2012 and applicable privacy guidance for employee and biometric information.
- Include complete references for every in-text citation.
- Avoid broad claims about productivity unless productivity is operationally defined and measured.
- Obtain adviser or ethics approval before collecting real biometric data.

## Paper revision checklist by chapter

### Chapter 1: Introduction

- Update the title and official system name.
- Rewrite the background around the current features.
- Revise the statement of the problem and research questions.
- Revise the general and specific objectives.
- Replace the old scope and delimitations.
- Add employees as authenticated system users.
- Separate implemented features from future biometric and AI work.
- Update the definition of terms.
- Correct grammar and incomplete sentences.

### Chapter 2: Review of Related Literature and Systems

- Add literature on employee self-service portals.
- Add literature on RBAC, MFA, and audit logging.
- Add literature on attendance, leave, and payroll integration.
- Add biometric privacy and fingerprint-performance literature.
- Distinguish descriptive analytics, statistical forecasting, rules, and AI.
- Add a synthesis showing the specific research gap addressed by WorkPulseAI.

### Chapter 3: Methodology

- Describe the actual development method used.
- Document functional and non-functional requirements.
- Add the system architecture, database design, data flow, and role-permission matrix.
- Explain participants, sampling, instruments, and ethical procedures.
- Define evaluation metrics and statistical treatment before testing.
- Treat fingerprint testing as a later phase if hardware remains unavailable.

### Chapter 4: Results and Discussion

- Present screenshots and test results only for working features.
- Show traceable functional test cases.
- Report usability, performance, reliability, and security findings.
- Discuss limitations and failed tests honestly.
- Do not present proposed AI or biometric outputs as actual results.

### Chapter 5: Conclusions and Recommendations

- Tie conclusions directly to the evaluated objectives.
- Do not conclude that fingerprint verification is effective without integration and testing.
- Recommend scanner integration, biometric evaluation, deployment hardening, and validated analytics as future work.

## Final decision rule

Use this rule whenever writing a system claim:

- **Implemented and tested:** describe in the present tense and provide evidence.
- **Implemented but not evaluated:** describe as implemented, but do not claim effectiveness or accuracy.
- **Designed or shown only in the interface:** describe as a prototype or proposed function.
- **Not implemented:** place under future development or recommendations.

This distinction will keep the new paper consistent, defensible, and honest while allowing fingerprint verification to remain an important planned feature of WorkPulseAI.
