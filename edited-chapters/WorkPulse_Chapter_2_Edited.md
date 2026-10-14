# Chapter 2: Methodology

This chapter describes the development process, architecture, data gathering, usability scoring, software verification, storage, and ethical considerations of WorkPulse. Requirements were gathered through interviews. SUS was the only respondent questionnaire used; no separate workplace-challenges or system-quality questionnaire was administered.

## Development Methodology

The development approach follows the Agile model through Scrum. Work is organized into a product backlog containing application requirements, defects, and improvements. Planning, design, implementation, testing, and review support successive revisions of the employee, attendance, leave, cash advance, payroll, and reporting modules.

Figure 1. Iterative development workflow

Requirements and product backlog
Sprint planning and design
Implementation and integration
Testing and review
Refinement and next sprint

Planning. Interview findings informed requirements for attendance, employee records, leave, cash advances, payroll, and employee access. Functional requirements include traceable manual corrections, notifications, protected payroll settlement, and limited offline saving.

Design. The employee-management module maintains profiles and classifications. Payroll uses employee identifiers to prepare earnings, cash advance deductions, carried unpaid earnings, and summaries. Authorization separates administrator actions from employee self-service and restricts personal records to their owners.

Development. React and TypeScript provide browser interfaces. Node.js and Express implement business rules and protected routes. MongoDB Atlas stores cloud records. IndexedDB and a service worker support selected local storage and cached resources.

Testing. Backend tests examine business rules against controlled records, including invalid times, overlapping sessions, settled payroll restrictions, request ownership, notifications, and synchronization. Browser checks exercise actual IndexedDB and service worker behavior with simulated API responses. The frontend production build checks that the application can be compiled for release.

Deployment. The frontend is hosted on Vercel, the cloud Express backend on Render, and authoritative records in MongoDB Atlas. Fingerprint attendance remains dependent on the configured local Windows workstation. The test results reported in Chapter 3 apply to the local application and controlled browser environment rather than a complete live deployment evaluation.

## System Architecture

The cloud application follows presentation, application, and data layers. Browser-local storage supplements these layers for supported offline operations. Fingerprint matching follows a separate hardware-dependent local execution path.

Figure 2. Cloud application and local attendance processing

Browser interface served by Vercel
Selected IndexedDB records and cached resources
Authenticated HTTPS requests to Render
Express authorization and business rules
MongoDB Atlas
Authoritative workforce records

Presentation Layer. React provides administrator, employee, and kiosk interfaces. Browser interface visibility is supported by server-side authorization rather than treated as an access control by itself.

Application Layer. Express routes handle authenticated requests, attendance rules, employee ownership, leave and cash advance workflows, payroll, notifications, audit logging, and duplicate-resistant synchronization.

Data Layer. MongoDB Atlas stores employee, account, attendance, leave, cash advance, payroll, settings, biometric, session, notification, and audit records. Locally queued actions are not authoritative cloud records until accepted by the server.

Local Fingerprint Processing. The browser captures samples through DigitalPersona reader components. The backend matching code launches a Windows PowerShell helper that loads the locally installed FingerJet runtime. This processing runs on the Windows machine hosting that matching backend, rather than directly on the remote Render service. A local backend using the cloud database still requires internet access for database operations. No completed cloud-to-local matching bridge is claimed in this study.

Email Integration. The backend supports configured email delivery for authentication and supported messages. The code includes SMTP through Nodemailer and Brevo HTTPS delivery. The research does not establish that both providers were used in production.

## Tools and Technologies

React 19, TypeScript, Vite, and Tailwind CSS provide browser interfaces, typed development, production bundling, and styling. Recharts presents graphical workforce summaries.

Node.js and Express provide the backend runtime and protected application services. MongoDB Atlas and MongoDB/Mongoose operations support cloud record storage.

IndexedDB stores account-specific supported requests and selected cached data. A service worker caches application resources for prepared-device offline access.

DigitalPersona components and HID FingerJet support the local reader and matching workflow. The current helper depends on Windows PowerShell and the locally installed native runtime.

The implementation uses scrypt password derivation and AES-256-GCM protection for stored biometric payloads. Configuration remains necessary for operational encryption and authentication.

Vercel and Render host the frontend and cloud backend. Dotenv supports configuration, while Git supports source-code revision tracking.

## Population and Locale of the Study

The revised study population comprises 30 MVL participants: two owners, two managers/supervisors, ten regular employees, and sixteen extra employees. These organizational categories are distinct from login access groups. Owners may use administrator access, while the other classifications belong to the employee access group. The listed population is not a claim that all participants were interviewed.

The locale is the MVL workplace in Salay Riles, Mangaldan, Pangasinan, Region I.

Table 1. Study population

| Classification | Number |

| --- | --- |

| Owner | 2 |

| Manager / Supervisor | 2 |

| Regular employee | 10 |

| Extra employee | 16 |

| Total | 30 |

## Data Gathering Techniques

Interviews. Interviews provided workplace requirements and concerns about attendance recording, employee information, leave, cash advances, and payroll. Interview findings are reported qualitatively. No survey frequencies, percentages, or direct quotations are assigned to these findings without corresponding records.

System Usability Scale. SUS was administered to evaluate perceived usability. It contains ten statements answered on a five-point response scale. The researchers’ computed overall result was 80.83. The SUS questionnaire is distinct from a workplace-challenges survey or a separate questionnaire rating security, performance, and reliability; those additional questionnaires were not administered.

No separate formal observation study, expert-validation procedure, pilot questionnaire study, or Cronbach’s alpha calculation is reported as completed in this methodology.

## Sources and Treatment of Data

Primary research sources consist of interviews and SUS responses. Project source code, supplied interface illustrations, and recorded software test outcomes support the description and functional evaluation of WorkPulse. Existing technical literature provides background and context.

Interview findings are organized by workplace topic without converting them into uncollected survey statistics. SUS scores represent participant perceptions of usability. Software test records identify input conditions, expected behavior, actual outcomes, and pass/fail status in the specified environment. The population table describes participant categories; it does not provide interview response frequencies.

## SUS Scoring

For each participant, odd-numbered SUS items contribute the response value minus one, and even-numbered items contribute five minus the response value. The ten contributions are added and multiplied by 2.5 to produce a participant score from 0 to 100. The overall SUS score is the mean of participant scores. This manuscript preserves the researchers’ computed result of 80.83; it was not replaced or recalculated during the chapter revision. A SUS score is not a percentage of participants who approved the system.

## Functional Verification Procedure

Local verification was performed on October 11, 2026. The backend suite exercised business rules using simulated database records and transaction behavior. The browser smoke test used an isolated Microsoft Edge profile, actual IndexedDB and service worker caching, and simulated server responses. Tests included valid and rejected attendance changes, payroll repayment behavior, account isolation, local saving, offline reload, reconnect synchronization, duplicate retries, and storage failure.

The 175 backend checks are software test cases, not respondent trials. Browser checks establish the observed behavior in the controlled environment. They do not constitute live Render/Vercel recovery tests, physical fingerprint performance measurements, or exhaustive infrastructure-failure testing. The expected and actual outcomes are presented in Chapter 3.

## Limited Offline Operation

Offline use requires prior online sign-in, a valid existing session, and a prepared browser/device with the necessary cached resources. Eligible attendance actions, leave requests, and cash advance requests are retained in IndexedDB. Cached information may be stale. Pending indicates local retention; Needs Review indicates an unresolved validation issue; Synced indicates acceptance by the server.

Employee requests may synchronize on reconnection after session validation. Attendance synchronization requires administrator password confirmation. The server checks ownership, dates, record versions, payroll restrictions, and operation identifiers. Fresh login, fingerprint transactions, approvals, and settlement actions remain dependent on online services. Passwords and raw fingerprint samples are not stored in the offline queue.

## Data Storage, Backup, and Recovery

MongoDB Atlas stores authoritative records under application authentication, ownership, validation, and authorization controls. Browser-local storage holds only selected cached records and supported queued actions. Stable identifiers prevent duplicate processing after an uncertain network response. Backup-format compatibility was exercised by software tests; those checks do not establish a successful restoration of the deployed production database. Browser storage may be cleared or unavailable and is not a replacement for database backup.

## Biometric Evaluation Boundary

The application includes a configured fingerprint attendance workflow. The available evidence does not include completed physical-reader trial counts, failed-capture measurements, false identification outcomes, or measured processing times. Consequently, no numerical biometric accuracy or speed results are reported. Future biometric evaluation should use consenting participants, documented reader conditions, genuine and unrecognized-finger trials, and recorded timing measurements.

## Ethical Considerations

WorkPulse handles personal, attendance, payroll, cash advance, and fingerprint information. Data handling is guided by transparency, legitimate purpose, proportionality, and restricted access. Research records should be anonymized where appropriate, and participation in evaluation should be voluntary. Statistical indicators support human review and do not automatically impose disciplinary or payroll decisions.

Manual attendance provides an alternative when fingerprint capture is unavailable. Corrections retain reasons and history and notify the affected employee when accepted. If the workstation itself is unavailable, a supervisor-verified paper log is a recommended contingency for later authorized entry. Organizational approval of that paper procedure is not asserted as a completed research result.
