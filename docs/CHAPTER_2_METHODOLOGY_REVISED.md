> **Author's working note — remove before submission:** The sprint table lists completed system work only. Confirm that its sprint numbers and sequence match the team's actual records and add the real sprint dates. Partial, pending, or unimplemented requirements must not be presented as completed sprint deliverables. Add final scanner versions, approved biometric test counts, retention periods, and evaluation results only after they are verified. Do not invent or backdate any activity.

# Chapter 2

# METHODOLOGY

This chapter presents the methodology used in the design, development, testing, and evaluation of **WorkPulse: Employee Attendance and Work Analytics Information System for MVL**. It discusses the development methodology, Scrum activities, system architecture, tools and technologies, user roles, population and locale of the study, data-gathering techniques, treatment of data, system and biometric evaluation procedures, data storage and security, and ethical considerations.

The methodology is aligned with the objectives and scope of WorkPulse. The system centralizes employee, attendance, leave, payroll, account, settings, biometric, and audit information; records fingerprint-verified attendance; provides employees with access to their authorized personal records and summarized payroll information; supports protected administrative workflows; and generates descriptive and AI-assisted workforce insights for administrator review.

## Development Methodology

The study uses the Agile Software Development Model through the Scrum framework. Scrum was selected because WorkPulse consists of interconnected modules that require iterative implementation, integration, testing, review, and refinement. Development requirements, panel recommendations, reported defects, and proposed improvements are organized into a product backlog and addressed through defined sprints.

At the beginning of each sprint, the researchers select prioritized backlog items and identify the sprint goal, expected deliverables, and acceptance criteria. During development, the team coordinates completed work, pending tasks, and technical obstacles. At the end of each sprint, implemented functions are tested and reviewed. Incomplete requirements and discovered defects are returned to the product backlog for a succeeding sprint.

### Scrum Roles

The Scrum responsibilities used during development are assigned according to the team's actual organization. The Product Owner represents the operational requirements of MVL and helps prioritize the product backlog. The Scrum Master facilitates the development process and helps the team address obstacles. The Development Team designs, implements, integrates, tests, and documents WorkPulse.

The Scrum development roles are separate from WorkPulse application roles. A person participating in the development process does not automatically receive administrator access to the deployed system.

### Completed Sprint Deliverables

The following table contains only functions already implemented in the current WorkPulse system. The final manuscript must use the team's actual sprint numbers, dates, order, and review records. A requirement must be removed from this table if it was not genuinely completed during the corresponding sprint.

| Sprint | Completed sprint goal | Completed deliverables |
|---:|---|---|
| 1 | Establish the system foundation | Requirements organization, interface foundation, React application, Express backend, MongoDB Atlas connection, and initial system structure |
| 2 | Implement secure access and role boundaries | Administrator and employee authentication, CAPTCHA, email OTP, secure sessions, administrator/regular/extra roles, backend role enforcement, and employee-record ownership restrictions |
| 3 | Implement employee and leave functions | Employee-record management, regular and extra employee accounts, employee portal, casual- and sick-leave balances, leave submission, and administrator approval or rejection |
| 4 | Implement attendance monitoring | Attendance-record viewing, daily date filtering, automatic clock-out rules, and support for a maximum of three time-in/time-out sessions per employee per workforce date |
| 5 | Implement the current payroll workflow | Attendance-based gross pay, stored payroll records, authorized additions, carried-over unpaid balances, administrator payroll summaries, printing, email delivery, and employee payroll-history summaries |
| 6 | Implement work analytics and AI Insights | Descriptive dashboards, Holt–Winters attendance forecasting, Bradford/time-decay attendance-risk signals, Modified Z-score arrival anomaly detection, and rolling FingerJet biometric operational-health information |
| 7 | Implement biometric attendance | DigitalPersona capture, three-impression enrollment, ANSI 378 template extraction, AES-256-GCM template protection, duplicate-enrollment detection, one-to-many identification, fingerprint kiosk attendance, and biometric evaluation recording support |

Partial and unimplemented requirements are maintained separately in the product backlog and are not counted as completed sprint deliverables. These currently include date-range attendance filtering, complete separation of compensation inputs from Employee Management, a detailed employee-facing payslip, statutory deduction processing, secondary-finger enrollment, and formal post-development respondent and biometric evaluation results.

## Phases of Development

### Planning

During planning, the researchers identify problems in existing attendance and workforce-information processes and translate them into functional, security, usability, and deployment requirements. The requirements include employee-information management, fingerprint-based time-in and time-out, attendance monitoring, leave credits and requests, payroll processing, employee payroll summaries, descriptive and AI-assisted analytics, system and workforce-policy settings, authentication, role-based authorization, employee-record ownership, and audit logging.

Daily attendance filtering is implemented. Date-range attendance filtering remains a product-backlog item until its controls and functional tests are completed.

### Design

During design, the researchers prepare the architecture, database organization, interfaces, user-role boundaries, fingerprint enrollment and attendance workflows, payroll process, leave-management workflow, analytics functions, administrative settings, and security controls.

Employee-management and payroll workflows are presented through separate administrative modules. Authorized salary and payroll-calculation inputs remain associated with the applicable employee identifier. WorkPulse does not claim that payroll inputs have been completely removed from employee management until those inputs are moved fully into the Payroll module.

### Development

During development, the researchers implement and integrate the WorkPulse modules. The React frontend provides administrator, employee, and attendance-kiosk interfaces. The Node.js and Express.js backend provides authentication, authorization, validation, business rules, attendance processing, biometric decisions, leave workflows, payroll operations, analytics, settings, audit logging, and communication with external services.

### Testing and Refinement

Testing is performed throughout development. Functional tests compare expected and actual behavior for authentication, authorization, employee operations, fingerprint enrollment, kiosk attendance, attendance-record viewing, leave processing, payroll workflows, settings, analytics, and audit logging. Security-control testing verifies authentication, role restrictions, employee-record ownership, input validation, session handling, request protection, and audit-event creation. Performance testing measures relevant application and biometric-processing response times.

Daily attendance filtering is included in functional testing. Date-range filtering will be tested only after implementation. Identified defects are corrected and re-evaluated before the affected function is treated as complete.

### Deployment

After development, testing, and required refinement, WorkPulse is prepared for deployment in the target organizational environment. Deployment includes the frontend application, Express backend, MongoDB Atlas connection, SMTP configuration, account permissions, system and workforce-policy settings, DigitalPersona reader components, biometric encryption configuration, and operational procedures.

Because MongoDB Atlas and SMTP are cloud-hosted services, their related functions require network connectivity. WorkPulse is not described as a completely offline system unless a separate local database and synchronization design are implemented.

## User Roles and Access Boundaries

WorkPulse distinguishes organizational positions from system account roles. The system implements three authenticated roles: administrator, regular employee, and extra employee.

The MVL manager is an organizational position and is assigned a regular employee account. The manager's organizational position does not automatically grant WorkPulse administrator privileges. The manager can access only the personal records and employee services permitted to a regular employee.

Regular and extra employees use the employee portal. They can view their authorized profile, attendance, leave, and summarized payroll information and can submit personal leave requests. They cannot enumerate or modify other employees, approve leave requests, process payroll, change system settings, access organization-wide audit records, enroll another employee's fingerprint, or perform protected administrative operations.

The administrator is a separate privileged system role. It performs authorized organization-wide employee management, biometric enrollment, attendance monitoring, leave decisions, payroll workflows, settings management, archive and restoration, audit review, backup functions, and protected administrative controls. The administrator is a system role and is not included as an employee respondent unless the individual assigned to that role separately participates in the research evaluation.

## System Architecture

### Three-Tier Architecture with Biometric and Email Integrations

WorkPulse follows a three-tier web architecture consisting of the presentation tier, application tier, and data tier. Local biometric components and the SMTP email service support the architecture but are not separate primary tiers.

```text
PRESENTATION TIER
Administrator workspace | Employee portal | Attendance kiosk
                         React 19
                            |
                            v
APPLICATION TIER
              Node.js and Express.js REST API
 Authentication | RBAC | Attendance | Biometrics | Leave
       Payroll | Analytics | Validation | Audit logging
                            |
                            v
DATA TIER
                       MongoDB Atlas

SUPPORTING INTEGRATIONS
Attendance kiosk/enrollment interface <-> DigitalPersona WebSDK and reader
Express backend <-> HID FingerJet extraction and matching process
Express backend <-> Nodemailer <-> SMTP email service
```

### Presentation Tier

The presentation tier uses React 19, TypeScript, Vite, Tailwind CSS, and Recharts. It contains the administrator workspace, employee portal, and fingerprint attendance kiosk. Interface visibility is adapted to the authenticated account, but hiding an interface is not treated as the primary security control.

### Application Tier

The application tier uses Node.js and Express.js. It exposes protected REST API routes and enforces authentication, RBAC, employee-record ownership, attendance rules, fingerprint decisions, leave workflows, payroll processing, settings, analytics, input validation, request protection, and audit logging.

### Data Tier

The data tier uses MongoDB Atlas. WorkPulse stores authorized employee, account, attendance, leave, payroll, settings, biometric-template, biometric-evaluation, session, and audit records in document-based collections.

### Biometric and Email Integrations

The attendance kiosk and fingerprint-enrollment interface use the DigitalPersona fingerprint library and WebSDK to communicate with the locally connected DigitalPersona U.are.U 4000B reader and capture raw fingerprint samples. The Express backend invokes the locally supported HID FingerJet process to extract ANSI 378 templates, validate enrollment consistency, detect duplicate enrollment, and perform one-to-many identification.

The Express backend communicates with an SMTP email service through Nodemailer for email OTP delivery and payroll-summary email functions.

## Tools and Technologies

- **React 19.** Provides the browser-based administrator, employee, and kiosk interfaces.
- **TypeScript.** Provides typed frontend application development.
- **Vite.** Provides the frontend development and production-build tooling.
- **Tailwind CSS.** Provides responsive interface styling.
- **Recharts.** Provides charts for descriptive and AI-assisted workforce insights.
- **Node.js.** Provides the JavaScript runtime for the backend application.
- **Express.js.** Implements the REST API, middleware, protected routes, and backend business services.
- **MongoDB Atlas.** Provides the cloud-hosted document database.
- **Mongoose and MongoDB collection operations.** Manage the database connection and application collection operations.
- **Nodemailer and SMTP.** Provide OTP and payroll-summary email delivery.
- **DigitalPersona fingerprint library and WebSDK.** Communicate with the local fingerprint reader and capture fingerprint samples.
- **DigitalPersona U.are.U 4000B.** Serves as the biometric reader used for development and evaluation.
- **HID FingerJet.** Extracts and compares ANSI 378 fingerprint templates through the supported local matching process.
- **Scrypt.** Protects passwords using Node.js's native key-derivation function and randomly generated salts.
- **AES-256-GCM.** Provides authenticated encryption for stored fingerprint templates.
- **Dotenv.** Loads protected development and deployment configuration values.
- **Git and GitHub.** Git tracks source-code changes, while GitHub hosts the project repository and supports collaboration, where used by the team.

## Functional Modules

### Employee Information Management

The administrator can create, update, archive, restore, and manage employee records and linked employee accounts. Employees are categorized as regular or extra according to the applicable employment classification. Protected administrative operations require appropriate authentication and authorization.

### Fingerprint Enrollment and Attendance

Before fingerprint attendance is used, the administrator confirms the employee record and captures three impressions of the same designated finger. HID FingerJet extracts an ANSI 378 template from each impression. WorkPulse accepts enrollment only when at least two of the three impressions are sufficiently consistent according to the configured threshold. The system also compares enrollment information against existing templates to reduce duplicate fingerprint registration.

Accepted templates are encrypted using AES-256-GCM and stored in the MongoDB Atlas `biometric_templates` collection. Raw fingerprint samples are converted into templates during processing and are not intentionally stored as permanent WorkPulse records.

During kiosk attendance, the employee presents an enrolled finger. The captured probe is compared against enrolled templates using one-to-many identification. When a valid match is found, the Express backend determines the next allowable attendance action and records it using a server-generated timestamp.

WorkPulse supports a maximum of three attendance sessions per employee per workforce date. Each completed session consists of one valid time-in followed by one valid time-out. The backend prevents invalid sequences and prevents more than three completed sessions in one day.

If the reader cannot produce a usable sample, the kiosk classifies the event as a failed capture rather than a valid rejection decision. The employee may retry according to the kiosk procedure. A repeated failure follows the approved organizational fallback procedure, which must be finalized before deployment.

Secondary-finger enrollment is not included in the current validated implementation. The three enrollment captures refer to three impressions of the same finger and must not be described as three separate fingerprint options.

### Leave Management

Employees can view authorized leave balances and submit personal leave requests. The administrator can review pending requests and approve or reject them. WorkPulse stores casual- and sick-leave balance information associated with employee records.

### Payroll Processing

WorkPulse calculates attendance-based gross pay when eligible attendance hours and the applicable hourly rate are available. Where the required calculation inputs are unavailable, the system uses the authorized stored gross-salary value according to the payroll workflow.

The current payroll relationship is:

\[
\text{Payroll Total} = \text{Gross Pay} + \text{Authorized Additions} + \text{Carried-Over Unpaid Balance}
\]

The administrator Payroll module displays the pay period, attendance-based gross pay, time worked, hourly rate, additions, carried-over unpaid balance, payroll status, and total payroll. It also supports printing and email delivery. Employees currently receive their personal payroll history and summarized payroll information through the employee portal.

Statutory deductions such as SSS, PhilHealth, Pag-IBIG, and withholding tax are outside the current validated implementation unless they are subsequently implemented and tested. WorkPulse must not claim a detailed deduction breakdown while these calculations remain outside the system.

### Analytics and AI Insights

WorkPulse provides descriptive dashboards and AI-assisted or statistical insights generated from stored workforce and biometric information. The implemented insights include:

- Holt–Winters additive forecasting with weekly seasonality for a seven-day attendance forecast;
- Bradford-factor attendance-risk signals with 30-day time decay and exclusion of approved leave;
- Modified Z-score anomaly detection using the median and median absolute deviation to identify unusual arrival times; and
- rolling FingerJet operational-health information based on recent biometric verification activity, scores, device information, response time, and controlled evaluation trials.

These methods are not all machine-learning models. The Bradford Factor is an attendance-risk rule, while the Modified Z-score is a statistical anomaly method. WorkPulse labels each insight with its method or version and readiness state. The results support administrator review and must not be used as the sole basis for discipline, payroll decisions, or employment action.

## Population and Locale of the Study

The study uses total enumeration by inviting all eligible members of the defined MVL population. The respondent population consists of one manager, ten other regular staff members, and nineteen student or part-time employees, for a total of thirty respondents.

| Respondent category | Organizational position | WorkPulse role | Number |
|---|---|---|---:|
| Manager | MVL manager | Regular employee | 1 |
| Regular staff | Full-time employee | Regular employee | 10 |
| Student/part-time employees | Part-time employee | Extra employee | 19 |
| **Total** |  |  | **30** |

The manager is separate from the ten other regular staff members but shares the same regular employee system role. The administrator is a system role and is not included in the respondent population.

Eligible participants must be currently associated with MVL, directly involved in attendance or workforce-information processes, at least 18 years old, and willing to provide informed consent. Individuals below 18 years old, third-party visitors, individuals on extended leave during evaluation, and individuals who do not provide consent are excluded.

The locale of the study is an MVL workplace in Salay Riles, Mangaldan, Pangasinan, Region I. Evaluation may use authorized actual records and suitable simulated records to limit unnecessary exposure of sensitive information.

## Data-Gathering Techniques

### Interview

A semi-structured interview is conducted with the MVL manager to identify existing attendance, employee-information, payroll, leave, reporting, workforce-policy, and operational requirements. The manager participates as an organizational respondent and uses a regular employee account in WorkPulse.

### Survey Questionnaire

A structured questionnaire is administered to eligible respondents after they use the functions permitted by their assigned roles. The instrument evaluates relevant aspects of functional suitability, usability, performance efficiency, reliability, and perceived security. The questionnaire undergoes content validation by three qualified IT or software-engineering experts before final administration.

A pilot test is conducted with individuals who do not participate in the final evaluation. Cronbach's alpha is calculated to examine the internal consistency of applicable questionnaire items. The final manuscript reports only the coefficient produced by the actual pilot-test data.

### Observation

The researchers observe existing attendance, employee-information, leave, payroll, and payroll-summary processes to identify workflow problems and functional requirements addressed by WorkPulse.

### Sources of Data

Primary data are obtained from interviews, questionnaires, observation, system tests, biometric trials, and respondent evaluation. Secondary data consist of relevant published literature, standards, official privacy sources, and technical documentation for the software and hardware used in WorkPulse.

## Treatment and Statistical Analysis of Data

Interview and observation data are organized according to recurring operational concerns and system requirements. Questionnaire data are summarized using frequency, percentage, weighted mean, and other appropriate descriptive measures.

The weighted mean is calculated as:

\[
\bar{x}=\frac{\sum fx}{N}
\]

where \(\bar{x}\) is the weighted mean, \(f\) is the response frequency, \(x\) is the numerical response weight, and \(N\) is the total number of responses.

| Mean range | Response | Acceptability interpretation |
|---:|---|---|
| 4.21–5.00 | Strongly Agree | Highly Acceptable |
| 3.41–4.20 | Agree | Acceptable |
| 2.61–3.40 | Neutral | Moderately Acceptable |
| 1.81–2.60 | Disagree | Less Acceptable |
| 1.00–1.80 | Strongly Disagree | Not Acceptable |

Questionnaire results measure respondent perceptions and do not independently establish technical correctness, security, or performance.

## System Evaluation Procedure

WorkPulse undergoes technical testing before respondent evaluation. Functional tests compare expected and actual behavior. Performance tests measure relevant response and processing times. Security-control tests verify authentication, role authorization, employee-record ownership, input validation, session handling, request protection, and audit logging.

The respondent instrument is adapted from the relevant product-quality characteristics of ISO/IEC 25010:2023 and evaluates functional suitability, usability, performance efficiency, reliability, and security. Respondents test only the functions permitted by their assigned WorkPulse roles.

## Biometric Evaluation Procedure

The biometric evaluation includes genuine attempts, controlled impostor attempts, and failed captures. During a genuine attempt, an enrolled participant presents the correct enrolled finger, and the expected result is successful identification. During a controlled one-to-many impostor attempt, a person or finger not enrolled in the evaluation database is presented, and the expected result is no match. An incorrect association with any enrolled employee is recorded as a false acceptance.

Participants do not obtain, reproduce, copy, or physically use another person's fingerprint. The approved protocol must specify the planned number of genuine and impostor trials per participant before testing. The results chapter reports the actual numbers performed, scanner configuration, matching threshold, environmental conditions, retries, invalid trials, and failed captures.

The biometric measures are:

\[
FAR=\frac{\text{False Acceptances}}{\text{Total Valid Impostor Comparisons}}\times100\%
\]

\[
FRR=\frac{\text{False Rejections}}{\text{Total Valid Genuine Comparisons}}\times100\%
\]

\[
FCR=\frac{\text{Failed Captures}}{\text{Total Physical Capture Attempts}}\times100\%
\]

Overall accuracy may also be reported when genuine and impostor trial counts and the denominator are clearly documented:

\[
\text{Accuracy}=\frac{\text{True Acceptances}+\text{True Rejections}}{\text{Total Valid Comparisons}}\times100\%
\]

Failed captures are reported separately because no valid biometric comparison occurs. Accuracy is interpreted together with FAR, FRR, FCR, and the genuine and impostor trial counts.

The elapsed time from a successful fingerprint capture to the final acceptance or rejection result is recorded. The mean, minimum, maximum, and standard deviation of valid processing times are reported.

## Data Storage, Backup, and Recovery

MongoDB Atlas stores authorized WorkPulse records. Application authentication, authorization, ownership restrictions, validation, and database configuration restrict access to these records. Biometric templates are encrypted using AES-256-GCM before storage.

Backup and recovery capabilities are configured according to the approved deployment plan. When backup functionality is enabled, a restoration test is performed to determine whether records can be recovered. Backups reduce data-loss risk but do not guarantee uninterrupted operation or complete recovery.

## Ethical Considerations

### Informed Consent and Voluntary Participation

Before interviews, questionnaires, usability evaluation, or biometric testing, each participant receives an informed-consent form explaining the purpose, procedures, information collected, possible risks, expected benefits, retention practices, and researcher contact details. Participation is voluntary. A participant may decline to answer a question or withdraw from the research evaluation without penalty. Research participation is distinguished from MVL's separate organizational attendance policies.

### Privacy and Security

WorkPulse is designed and evaluated with reference to Republic Act No. 10173, its implementing rules, and the principles of transparency, legitimate purpose, proportionality, accountability, and reasonable security safeguards. Fingerprint templates and employee, attendance, leave, payroll, authentication, and audit information are accessible only through authorized processes.

### Fair and Inclusive Processing

Fingerprint attendance is intended to strengthen identity assurance rather than evaluate employee ability or performance. Employees who experience repeated fingerprint-capture difficulties follow an approved alternative attendance procedure. AI-assisted and statistical insights support human review and do not automatically impose disciplinary, payroll, or employment actions.

### Biometric Retention and Deletion

Active biometric templates are retained only while fingerprint attendance remains necessary and authorized. Before deployment, MVL establishes the exact template-retention period, deletion procedure following separation or withdrawal of applicable authority, evaluation-data retention period, backup-retention schedule, deletion authority, and deletion documentation.

## References

The final reference list should follow the citation format required by the institution and include complete entries for the sources actually used, including:

- ISO/IEC 25010:2023;
- Republic Act No. 10173 and relevant National Privacy Commission guidance;
- React, Node.js, Express.js, MongoDB Atlas, Mongoose, and Nodemailer documentation;
- DigitalPersona fingerprint library and WebSDK documentation;
- HID FingerJet documentation;
- DigitalPersona U.are.U 4000B documentation;
- Holt–Winters forecasting references;
- Bradford Factor references;
- Modified Z-score and median absolute deviation references; and
- the team's Agile and Scrum references.
