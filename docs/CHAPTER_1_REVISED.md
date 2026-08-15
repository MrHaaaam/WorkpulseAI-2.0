> **Author's pre-submission note (remove from the final manuscript):** This chapter describes the intended completed state of WorkPulseAI for presentation. Before submitting the final paper, confirm that fingerprint enrollment, verification, time-in/time-out recording, error handling, and biometric testing are operational. Do not add accuracy, FAR, FRR, or usability results until actual testing has been completed.

# Chapter 1

# INTRODUCTION

## Background of the Study

Employee attendance and workforce information management are important components of organizational operations because they influence accountability, administrative efficiency, payroll processing, and managerial decision-making. Organizations increasingly use digital workforce systems to replace paper logs, spreadsheets, and disconnected applications that are susceptible to encoding errors, inconsistent records, slow processing, and limited access to useful information. Modern workforce platforms can centralize employee information, attendance, leave, and payroll records while providing dashboards and reports that assist authorized personnel in monitoring organizational activities.

Despite advances in workforce technology, some organizations continue to manage employee records through manual or partly digital processes. Attendance may be recorded separately from leave and payroll information, requiring administrators to reconcile data from multiple sources. Such arrangements can result in inaccurate records, delayed approvals, repetitive administrative work, and limited transparency for employees. Attendance systems that depend only on handwritten entries, identification cards, or personal identification numbers may also allow proxy attendance or “buddy punching” when identity is not adequately verified.

Biometric attendance verification offers a possible response to this identity-assurance problem. A fingerprint is associated with an individual and can be used to verify whether the person attempting to record attendance corresponds to an enrolled employee. However, the use of biometric information also introduces important responsibilities concerning consent, access control, secure template handling, retention, deletion, system reliability, and the management of false acceptance and false rejection. Consequently, biometric attendance should be implemented as part of a broader secure workforce management process rather than treated as an isolated timekeeping feature.

In the Philippine context, organizations are adopting digital platforms to improve human resource and administrative processes. The Philippine human resource technology market includes workforce management, payroll management, performance management, recruitment, and related applications, reflecting continued interest in digital HR tools (IMARC Group, 2026). At the national level, the Philippine Civil Service Modernization Project was formally launched in September 2025 to support the digital transformation of government human resource and payroll systems and improve efficiency, transparency, and accessibility (Civil Service Commission, 2025). These developments demonstrate the growing importance of centralized and technology-supported workforce administration.

Digitalization alone, however, does not guarantee accurate, transparent, or secure workforce management. Systems that process employee profiles, government identifiers, attendance, leave reasons, payroll amounts, authentication credentials, and biometric information must protect these records against unauthorized access, improper modification, disclosure, and loss. They must also enforce appropriate permissions so that administrators can perform authorized organizational functions while employees can access only their own records and services.

In response to these concerns, this study develops **WorkPulseAI**, a responsive and secure web-based workforce information management system. The system centralizes employee profiles, attendance records, leave requests, payroll information, organizational settings, and audit events through a MongoDB Atlas database. It provides authenticated administrator and employee workspaces, role-based access control, employee self-service functions, descriptive dashboards, and protected administrative workflows.

WorkPulseAI also incorporates a fingerprint-based attendance kiosk for employee time-in and time-out. The biometric component is designed to associate each attendance attempt with the enrolled employee, reduce unauthorized clock-ins, and improve attendance identity assurance. Its effectiveness is evaluated through functional tests, biometric performance measures, and usability assessment rather than assumed from the presence of the scanner alone.

The project supports Sustainable Development Goal 8, Decent Work and Economic Growth, by promoting more transparent and organized workforce processes. It also supports Sustainable Development Goal 9, Industry, Innovation and Infrastructure, through the integration of web technology, centralized data management, security controls, descriptive analytics, and biometric attendance hardware.

## Statement of the Problem

Some organizations manage employee information, attendance, leave, and payroll using disconnected or partly manual processes. These practices can lead to inconsistent records, delayed processing, limited employee transparency, repetitive administrative work, and difficulty producing timely reports. Weak authentication, authorization, and accountability controls may also expose sensitive workforce information to unauthorized access or modification. Furthermore, attendance mechanisms that do not adequately verify identity may permit proxy attendance and reduce confidence in recorded time-in and time-out information.

This study seeks to answer the following questions:

1. What problems and requirements are encountered in managing employee information, attendance, leave, and payroll through existing manual or fragmented processes?
2. What functional and security requirements should WorkPulseAI provide for administrators and employees?
3. How can WorkPulseAI centralize workforce records and support employee management, attendance monitoring, leave processing, payroll workflows, descriptive reporting, and employee self-service?
4. How acceptable is WorkPulseAI in terms of functional suitability, usability, performance efficiency, reliability, and security?
5. How accurately and reliably does the fingerprint-verification component authenticate employees during time-in and time-out?
6. What operational and usability issues are encountered when employees and administrators use the fingerprint-based attendance process?

## Objectives of the Study

### General Objective

The general objective of this study is to design, develop, and evaluate WorkPulseAI as a secure web-based workforce information management system that centralizes employee, attendance, leave, and payroll records; provides role-based administrator and employee services; generates descriptive workforce information; and uses fingerprint verification for employee time-in and time-out.

### Specific Objectives

Specifically, this study aims to:

1. identify the problems and requirements associated with existing employee information, attendance, leave, and payroll processes;
2. develop a centralized web-based system using MongoDB Atlas for employee records, attendance monitoring, leave management, payroll workflows, settings, and audit information;
3. implement authenticated administrator and employee access based on assigned roles and employee-record ownership;
4. provide an employee self-service portal for viewing personal information, attendance, payroll, and leave records and for submitting leave requests;
5. implement security controls that include password authentication, email one-time passwords, CAPTCHA, authorization, secure session management, request protection, input validation, rate limiting, and audit logging;
6. produce descriptive dashboards and reports from stored workforce records;
7. integrate a fingerprint scanner with an attendance kiosk for verified employee time-in and time-out;
8. prevent invalid attendance sequences, including duplicate time-in, time-out without an active time-in, and unauthorized attendance attempts;
9. evaluate the software using defined criteria for functional suitability, usability, performance efficiency, reliability, and security; and
10. evaluate fingerprint verification using measured biometric performance, processing time, failed-capture observations, and user feedback.

## Scope and Delimitation

This study covers the design, development, and evaluation of WorkPulseAI, a responsive web-based workforce information management system that uses a cloud-hosted MongoDB Atlas database. The system centralizes employee profiles, attendance records, leave requests, payroll records, organizational settings, and security audit events.

WorkPulseAI provides separate authenticated workspaces for administrators and employees. Administrators can manage employee information, review attendance, process leave requests, manage payroll workflows, configure permitted system settings, access descriptive dashboards, and perform protected administrative operations. Employees can access only their authorized personal profile, attendance, payroll, and leave information and can submit leave requests for administrative review. The implemented account structure consists of an administrator role and employee portal roles categorized as regular and extra employees. Separate HR, manager, and team-leader roles are not included in the present study.

The attendance component includes a kiosk connected to a supported fingerprint scanner. Employees enroll a fingerprint template through an authorized enrollment process. During attendance recording, the system uses a live fingerprint scan to verify the employee before accepting a time-in or time-out event. Attendance controls validate the event sequence and record the employee, date, time, verification outcome, and relevant audit information.

The biometric implementation is limited to the selected fingerprint-scanner model, its supported driver or software development kit, and the configured matching process. Results obtained using the selected device and participants are not automatically generalizable to every fingerprint scanner, workplace, population, or environmental condition. The study does not include facial recognition, iris recognition, voice authentication, or webcam-based attendance verification. An authorized fallback procedure may be required for employees whose fingerprints cannot be captured or consistently verified.

WorkPulseAI generates descriptive workforce analytics using existing records. These include counts, rates, trends, and summarized attendance, leave, payroll, employee, and biometric-enrollment information. The AI Insights module presents advanced analytical approaches, including forecasting and anomaly detection, but these approaches are not treated as validated automated decision-making models unless they are separately implemented and evaluated. The system does not provide a complete measurement of employee productivity, work quality, or job performance. Analytical outputs must not be used as the sole basis for disciplinary or payroll decisions.

The system depends on its configured application server, MongoDB Atlas connection, and email service. Internet access is therefore required for normal cloud database and email operations unless the system is separately deployed with supported local services. Although the interface is responsive, mobile access depends on network availability, browser compatibility, and the final deployment configuration.

The study evaluates security controls implemented at the application level. It does not claim that WorkPulseAI is immune to every cybersecurity threat. Production security also depends on infrastructure configuration, database permissions, HTTPS deployment, credential management, backups, monitoring, incident-response procedures, and organizational policy.

## Significance of the Study

This study may contribute to improved workforce information management by integrating employee records, attendance, leave, payroll, employee self-service, descriptive reporting, security controls, and biometric attendance verification in one system. The following stakeholders may benefit from the study:

### Organizations and Administrators

Organizations and authorized administrators may use WorkPulseAI to centralize workforce records, reduce repetitive administrative tasks, review attendance information, manage employee accounts, process leave requests, manage payroll workflows, and obtain summarized information for operational decisions. Fingerprint verification may strengthen identity assurance during attendance recording when supported by appropriate procedures and acceptable measured performance.

### Employees

Employees may benefit from improved access to their authorized personal records through the employee self-service portal. They can review attendance and payroll information, monitor leave records, and submit leave requests. Fingerprint verification may also help associate attendance transactions with the correct enrolled employee, subject to the limitations and error rates of the selected device and matching process.

### IT Practitioners and Developers

The project may serve as a reference for integrating a responsive web application, cloud-hosted document database, biometric attendance hardware, role-based access control, multi-factor authentication, session protection, audit logging, and administrative workflows. It also demonstrates the need to evaluate biometric performance rather than claiming reliability solely from hardware integration.

### Future Researchers

The study may provide a foundation for future work involving biometric attendance, privacy-aware workforce systems, employee self-service, cloud-based workforce management, validated forecasting, anomaly detection, scanner-performance monitoring, and comparisons among biometric devices or matching thresholds.

## Definition of Terms

The following terms are operationally defined according to their use in this study:

**Attendance Kiosk.** The WorkPulseAI interface and connected biometric process through which an enrolled employee performs fingerprint-verified time-in and time-out.

**Attendance Record.** A stored record containing information about an employee's attendance date, time-in, time-out, status, and related verification or processing information.

**Audit Trail.** A chronological record of important authentication, administrative, attendance, and system actions maintained for accountability and security review.

**Authentication.** The process of confirming a user's identity before permitting access to WorkPulseAI or accepting a protected operation.

**Authorization.** The process of determining which records and functions an authenticated user is permitted to access.

**Biometric Enrollment.** The authorized process of capturing and registering fingerprint information associated with an employee for subsequent attendance verification.

**Biometric Template.** A processed representation of fingerprint characteristics used for biometric comparison. It is distinct from a normal photograph of a fingerprint.

**CAPTCHA.** A challenge used by WorkPulseAI to reduce automated login attempts.

**Descriptive Analytics.** The summarization of historical workforce data through counts, rates, tables, and charts without predicting future outcomes.

**Employee Portal.** A role-restricted WorkPulseAI workspace through which an employee accesses authorized personal records and services.

**False Acceptance Rate (FAR).** The proportion of controlled impostor verification attempts that the biometric component incorrectly accepts.

**False Rejection Rate (FRR).** The proportion of genuine employee verification attempts that the biometric component incorrectly rejects.

**Fingerprint Scanner.** The biometric hardware device connected to the WorkPulseAI attendance process to capture fingerprint information for employee enrollment and verification.

**Fingerprint Verification.** The process of comparing a live fingerprint scan with enrolled fingerprint information to determine whether an attendance attempt should be accepted or rejected.

**MongoDB Atlas.** A managed cloud database service used by WorkPulseAI to store and manage document-based collections containing employee, account, attendance, leave, payroll, settings, and audit information.

**Multi-Factor Authentication (MFA).** An authentication process requiring more than one form of verification. In WorkPulseAI, protected login uses a password and an email one-time password, together with a CAPTCHA challenge intended to reduce automated attempts.

**One-Time Password (OTP).** A temporary verification code sent to the account's registered email address and used during authentication.

**Role-Based Access Control (RBAC).** The restriction of system capabilities according to the authenticated account's assigned role and, for employee services, ownership of the linked employee record.

**Session Management.** The creation, validation, expiration, and revocation of authenticated WorkPulseAI sessions.

**Workforce Information Management.** The organized storage, processing, retrieval, and reporting of employee, attendance, leave, payroll, and related organizational records.

**WorkPulseAI.** The web-based workforce information management system developed in this study to centralize employee-related records, provide administrator and employee services, generate descriptive information, enforce security controls, and support fingerprint-verified attendance.

## Citation verification notes

Remove this section from the final manuscript after completing the reference list.

- Verify the required citation style with the research adviser, such as APA 7th edition.
- Use the Civil Service Commission's official September 2025 announcement for the Philippine Civil Service Modernization Project.
- Verify the publication date and bibliographic format of the IMARC Group Philippine HR Technology Market page before finalizing the reference entry.
- The earlier draft's “Ijiga et al., 2025” reference was not sufficiently identifiable from the information provided. Do not restore it without the complete article, correct authors, journal, year, volume, issue, pages, and DOI or stable URL.
- “International Journal of Science and Research Archive, 2026” is a journal name rather than a complete author citation. Use the article's authors and complete bibliographic details if that source is retained.
- Add peer-reviewed literature on biometric attendance, employee self-service, workforce information systems, biometric performance evaluation, and privacy.
- Include applicable Philippine privacy sources when discussing employee and biometric information.
