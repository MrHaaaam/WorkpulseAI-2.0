**WorkPulse: Revisions to Align Chapters 1, 2, and 3**

Prepared from the two chapters supplied on September 21, 2026, the user's clarification that approximately ten evaluation participants are anticipated but unconfirmed, and the local application code reviewed in this conversation.

These passages are proposed manuscript revisions. They do not assert that interviews beyond those described, expert validation, pilot testing, surveys, policy approvals, or technical evaluations have already occurred. The original chapter files have not been overwritten.

**Main decisions used in this revision**

- Retain all five research questions and all five quality criteria in Chapter 1.
- Identify completed initial data gathering as interviews with the boss and manager. Confirm their formal titles and actual interview records.
- Replace the unsupported fixed thirty-person evaluation and total-enumeration claim with an anticipated small evaluation of approximately ten intended users. The proposed sampling method is purposive selection by actual work role, subject to final research-plan confirmation.
- Include actual administrative users because the system is substantially administrative. Do not invent the administrator/employee split or assume a manager uses an admin account.
- Use standard SUS for perceived usability, a separately reviewed supplementary instrument for the other four perceived quality areas, and technical tests for actual system behavior.
- Keep Chapter 1's descriptive-analytics scope as the evaluated scope. Predictive functionality in the implementation is not automatically included in the research claims. If forecasting is to be evaluated, revise the objectives and methodology explicitly instead.
- Retain a separate biometric evaluation, with expected and returned identity recorded for one-to-many matching.

**Chapter 1: corrections and replacement passages**

**A. Keep the research questions, but define the evidence for Question 4**

The five existing questions provide a suitable structure for Chapter 3. Add the following after the Statement of the Problem:

> In this study, system acceptability will be examined through role-appropriate user feedback and documented technical evaluation. SUS will measure perceived usability. Supplementary questionnaire items will address observable functional suitability, perceived performance efficiency, perceived reliability, and perceived security. Functional, performance, reliability, and security-control tests will provide separate evidence of system behavior. User agreement will not be treated as proof of technical security or calculation accuracy.

Do not remove the four non-usability criteria merely because SUS is available. Alternatively, narrowing Question 4 to usability alone would require changing the objectives and Chapter 2; this revision does not make that reduction.

**B. Replace the role restriction in Scope and Delimitation**

Replace the sentence limiting roles to administrators and “regular employees” with:

> WorkPulse provides two user-facing access groups: administrators and employees. Employee accounts may have the Regular or Extra classification used by the implementation, subject to confirmation of how these classifications correspond to MVL's actual employment categories. A person's organizational title, such as manager, does not automatically determine their account permissions. No separate HR or middle-management portal is included.

Use the same distinction in the definitions of Employee and RBAC. Do not assume every student employee must be classified as Extra without confirmation.

**C. Replace the Scope and Delimitation text with this aligned version if desired**

> This study covers the design, development, and evaluation of WorkPulse, a responsive web-based workforce information management system for MVL using MongoDB Atlas. The evaluated scope includes employee records, fingerprint attendance identification and Time-In/Time-Out recording, daily attendance monitoring, leave-request processing, payroll-related workflows, employee self-service, descriptive dashboards, company settings, and selected authentication, authorization, session, validation, request-protection, and audit controls.
>
> The system provides administrator and employee interfaces. Employee accounts may use the Regular or Extra classification, according to the confirmed organizational arrangement. Employees access their own authorized records and submit their own leave requests. Administrative workflows are evaluated by actual intended administrative users.
>
> Fingerprint attendance is limited to the reader, matcher, threshold, and deployment environment documented in the evaluation. The system performs a search against enrolled fingerprint templates to identify the employee before recording attendance. It does not include facial recognition or webcam-based attendance. Recognition errors and operational failures will be measured under specified conditions; the study does not assume that biometric verification eliminates all unauthorized attendance.
>
> Daily attendance filtering is included. Date-range filtering remains a backlog item unless implementation and testing are completed and documented. The evaluated analytics summarize recorded workforce information and do not establish employee productivity, employee intent, or automatic disciplinary decisions. Predictive or experimental analytical functions are outside the evaluated claims unless a corresponding objective and evaluation method are added.
>
> Payroll evaluation is limited to the documented calculation rules, inputs, and workflows actually implemented and agreed for testing. The study does not claim a complete statutory payroll computation merely because the system produces payroll summaries. Unimplemented compensation, deduction, or leave-payment rules will be identified as limitations.
>
> WorkPulse depends on the configured application server, supported biometric components, network access to MongoDB Atlas, and email services for the functions that use them. It is not presented as a fully offline system. Findings are limited to the actual participants, software version, records, and test conditions and will not automatically be generalized to other organizations.

**D. Remove claims that assume the findings before evaluation**

| Existing expression | Suggested wording |
|---|---|
| “preventing unauthorized clock-ins” | “intended to reduce unauthorized attendance through fingerprint identity checks” |
| “ensures that attendance records are tightly associated with the correct employee” | “checks the captured fingerprint against enrolled templates before recording attendance” |
| “highly reliable method” | “a biometric attendance method whose reliability will be evaluated” |
| “ensure … continuous data storage” | “support cloud-hosted record storage, subject to service and network availability” |
| “Employees benefit from accurate attendance records, fair evaluations…” | “Employees may benefit from access to their records and clearer attendance and leave information…” |

Delete the repeated “IT Practitioners and Developers” label and fix minor grammar such as “processes involved in recording.” Use “password authentication with email OTP verification” consistently rather than treating the general label MFA as proof of a particular assurance level.

**E. Bibliography checks still needed**

The pasted Chapter 1 does not include a full bibliography. Confirm complete author, title, publication, date, and source details for Ijiga/ljiga et al. (2025), the 2026 article attributed to the journal name, IMARC Group (2025), and the Civil Service Commission (2025) initiative. These citations and their factual claims have not been independently validated by this revision. Cite article authors rather than the journal as author unless that attribution is actually correct. Treat SDG links as the project's intended contribution rather than measured achievement.

**Chapter 2: passages to replace or add**

**1. System Architecture Overview — replace the opening paragraph**

> WorkPulse uses a three-tier architecture consisting of a browser-based presentation tier, a Node.js and Express application tier, and a MongoDB Atlas data tier. The application integrates supported fingerprint-capture and matching components and an SMTP email service. This architecture supports the separation of interfaces, business rules, and data storage. Its response times, reliability, and security controls will be evaluated through the documented tests.

This removes the incorrect “facial recognition processing” reference and avoids claiming proven rapid or dependable processing before testing. Retain the tier descriptions, but name the exact reader as the evaluation device only after confirming what was actually used.

**2. Population, Locale, and Selection of Participants — replacement**

> The study will be conducted at the MVL workplace in Salay Riles, Mangaldan, Pangasinan, Region I. The eligible evaluation population consists of intended WorkPulse users who perform relevant employee or administrative activities. The actual workforce count and distribution of system roles will be confirmed with management.
>
> Approximately ten participants are anticipated for this small organizational evaluation. This is a planning estimate rather than a fixed or completed sample. Participants will be purposively selected to cover the actual administrative and employee workflows, considering their responsibilities, availability, and voluntary participation. The final number invited, number participating, role distribution, and reasons for incomplete participation will be documented. The study does not claim total enumeration unless all eligible members are actually invited under a documented census plan.
>
> Actual intended administrative users will evaluate administrative functions, while employees will evaluate their attendance and employee-portal functions. Where practical, all actual intended administrative users will be invited because substantial WorkPulse functionality is administrative. Organizational position and system role will be recorded separately. The manager will not automatically be assigned an employee or administrator role for research purposes; the role will reflect intended operational use.
>
> The boss and manager who participated in initial interviews may also join the evaluation if they meet the criteria. Their interview participation will be recorded separately from their evaluation participation. A person performing both roles will remain one unique participant, with any separate role-specific sessions identified. Researchers acting as technical testers will not be counted as independent end-user respondents merely to increase the sample.
>
> Findings will describe the participating users and tested workflows. An individual administrator's result will not be generalized to all administrators, and the approximate sample of ten will not be described as statistically representative without a separate justification.

**Table 1. Planned Evaluation Coverage**

| Intended system role | Eligibility | Anticipated count |
|---|---|---|
| Administrator | Actual person responsible for administrative WorkPulse functions | To be confirmed |
| Employee | Actual intended user of attendance and employee self-service functions | To be confirmed |
| Total unique participants | Both groups, without double-counting people | Approximately 10; subject to confirmation |

Replace the former 1 manager / 10 staff / 19 student employees table. Do not convert “approximately ten” into ten completed responses.

**3. Data-Gathering Techniques — replacement**

> Initial interviews. Initial data gathering consisted of interviews with the company's boss and manager concerning current employee-information, attendance, leave, payroll, reporting, and operational processes. Their formal positions, interview dates, and supporting notes will be documented. Follow-up semi-structured interviews will clarify missing information. Findings will be attributed to their actual sources; no initial employee survey will be claimed unless it was conducted.
>
> Observation and document review. Where conducted with organizational authorization, researchers will observe the relevant workflows and review suitable records to clarify requirements and test cases. The date, process, evidence, and limitations of each activity will be recorded. Unperformed observations will not be described as completed.
>
> Policy presentation and review. Researchers will present the proposed WorkPulse operating policies and demonstrate the associated system behavior to management. The review will distinguish current company practices, configurable software defaults, and proposed changes. Management decisions, approved values, responsible persons, effective dates, and unresolved issues will be documented and translated into requirements before final testing.
>
> Task-based evaluation. Participants will perform realistic tasks appropriate to their actual system roles using authorized test records. Researchers will document independent completion, assistance, errors, and comments. Timing boundaries and assistance rules will be specified before testing where task time is measured.
>
> SUS questionnaire. After the assigned tasks, participants will complete the standard ten-item System Usability Scale developed by Brooke (1996). Its wording, order, and scoring procedure will be retained. SUS measures perceived usability and will not replace technical security, correctness, or biometric tests.
>
> Supplementary quality questionnaire. A separate researcher-developed instrument will collect applicable ratings of functional suitability, perceived performance efficiency, perceived reliability, and perceived security. Respondents will rate only functions and conditions they experienced. A Not applicable/not observed option will be provided separately from the five-point agreement scale. The supplementary scores will not be added to the SUS score.
>
> Technical and biometric testing. Researchers will execute documented test cases and biometric trials using known expected outcomes. Tests will examine calculation correctness, role and ownership restrictions, reliability under defined conditions, application response times, and fingerprint identification/attendance outcomes.

Delete references to “school tracing,” “alumni information,” and “institution” in the old Sources of Data paragraph. Do not claim staff/student feedback already shaped the system if no such initial feedback was collected.

**4. Instrument Review and Pilot — replacement**

> The researcher-developed supplementary questionnaire and task materials are planned for content review by three qualified IT or software-engineering experts before final administration. The standard SUS instrument will remain distinct; its established status does not make the supplementary questions validated automatically. Review comments and resulting revisions will be documented.
>
> A pilot is planned with eligible individuals who will not participate in the final evaluation, subject to confirmation of access to suitable participants. The pilot will examine instructions, task feasibility, questionnaire comprehension, and administration procedures. Where the pilot data are adequate for estimation, internal consistency will be examined for conceptually related multi-item scales, with the exact item set, sample size, coefficient, and limitations reported. No coefficient will be invented or assumed. Unrelated quality dimensions will not be combined solely to produce one alpha value.
>
> If the planned experts or separate pilot participants cannot be obtained, the methodology will be revised with the adviser before final administration and the limitation reported. A small pilot or high alpha does not by itself establish content validity or generalizability.

The approximate ten-person final evaluation does not automatically include three experts plus pilot participants. These are separate activities, with actual counts documented separately. Do not make an unconfirmed expert/pilot commitment sound completed.

**5. Treatment of Data — replacement**

> Interview analysis. Interview notes or transcripts will be reviewed and grouped into documented topics or themes. Each reported finding will retain a reference to its supporting source. Quotes will be reproduced accurately and personal identifiers minimized. Interview findings will not be represented as thirty-person survey percentages.
>
> Response handling. Participant codes, role, questionnaire version, and completeness will be recorded. Formatting and data-entry errors will be checked against source records. Missing or unclear answers will not be invented or changed by the researchers. Not applicable responses will remain distinct from neutral agreement. The treatment of incomplete forms will be documented before analysis.
>
> SUS scoring. For complete questionnaires, subtract one from responses to items 1, 3, 5, 7, and 9; subtract responses to items 2, 4, 6, 8, and 10 from five; sum the adjusted values and multiply by 2.5. Report participant scores and role-specific means, with sample sizes and spread where estimable. A score is on a 0–100 scale and is not a percentage. If only one administrator participates, report that individual's score. Any interpretation benchmark will be identified and cited.
>
> Supplementary ratings. For each item, report the number and distribution of valid 1–5 responses and the mean, calculated as the sum of response values divided by the number of valid responses. Not applicable and missing values will be excluded from the denominator and reported separately. For a criterion summary, first calculate each participant's mean across at least two of its three applicable items, then average those participant means within the role group. Report the contributing participant count and item coverage. This is a prespecified descriptive convention, not a claim that the new instrument is standardized. Do not label an equal-weight arithmetic mean as a specially weighted statistic or combine it with SUS.
>
> Technical results. Report expected and actual outcomes, pass/fail/not-tested counts, unresolved defects, and supporting evidence. If a pass rate is shown, use executed applicable tests as its denominator and report unexecuted tests separately. Performance results will include operation, hardware/network/load conditions, trial count, timing boundaries, mean and range, and a criterion established before testing.
>
> Interpretation. Conclusions about the five quality areas will distinguish user perception from observed technical behavior. Differences between roles will be descriptive unless a justified comparative design is used. No before-and-after improvement will be claimed without corresponding measurements.

**6. Add: System and Biometric Evaluation Procedures**

> Functional tests will cover employee records, daily attendance filtering, approved attendance rules, leave dates and balances, payroll cases independently calculated under the approved rules, and descriptive reports checked against source records. Security-control tests will cover login and OTP conditions, account roles, employee-record ownership, sessions, validation, request protection, and selected audit events. Reliability tests will define repeated-operation, duplicate-submission, and controlled service-failure scenarios. Performance measurements will specify the measured operation and timing boundaries before execution.
>
> Fingerprint evaluation will document the actual reader, matcher version, decision threshold, enrolled-gallery size, participants, attempts per participant, and capture conditions. Enrollment samples will be separate from final test captures, and the final threshold will be fixed before outcome measurement. Known expected identities will be compared with the returned identities and attendance actions.
>
> Because WorkPulse uses one-to-many identification, enrolled-person trials will distinguish correct identity, wrong accepted identity, and no-match outcomes. Non-enrolled-probe trials will record whether a probe is rejected or incorrectly assigned to an enrolled employee. A registered employee scanning their own enrolled finger is not a non-enrolled test merely because another employee's record is being discussed. Capture failures, matcher/service failures, and attendance denials due to schedule or leave rules will be recorded separately from identity errors.
>
> Report correct identification, wrong-identity acceptance, and no-match proportions over completed enrolled-person searches; report false-positive identification over completed non-enrolled searches. Every proportion will include its numerator and denominator. If a type of trial is not conducted, its measure will be reported as Not evaluated. Matcher time and end-to-end attendance time will be measured separately. Repeated attempts will not be counted as additional independent participants, and a displayed match-strength score will not be treated as empirical accuracy.

NIST distinguishes one-to-one verification from one-to-many identification and their error measures: [A Tale of Two Errors](https://www.nist.gov/blogs/taking-measure/tale-two-errors-measuring-biometric-algorithms).

**7. Ethical Considerations — factual corrections**

- Replace “facial recognition data” with “fingerprint samples and templates.”
- Replace unsupported completed claims such as “safeguards were put in place” with the actual implemented controls and evidence, or planned procedures where pending.
- Retain the cited privacy-law framework only with an accurate supporting reference; this revision is not a legal-compliance determination.
- Do not promise complete anonymity when a single administrator or manager may be recognizable by role. Describe participant coding, restricted access, and reporting precautions accurately.
- Document voluntary participation and the ability to decline without employment consequences, as an organizational research arrangement to be confirmed before recruitment.
- Revise the data-purpose statement: attendance is also used for payroll and reporting, not only identity verification/monitoring. Disclose the actual purposes and recipients.
- Describe alternative attendance as a procedure to be agreed and documented before testing; do not imply an implemented fallback exists if it does not.
- Give actual retention/disposal arrangements for research responses, biometric trials, and exports when confirmed. Do not assume application audit expiry governs all research data.
- Retain human review of analytical outputs, but remove “objective” or “no judgments beyond facts” claims that overlook model assumptions and rule choices.

**Suggested participant-information wording**

> Participants will be informed of the study's purpose, the tasks involved, the information collected, the use of fingerprint captures where applicable, the handling of attendance/payroll test records, and the intended reporting of results. Participation arrangements, access to research records, retention, and disposal will be documented before data collection. Participant codes will be used, while acknowledging that particular workplace roles may remain recognizable. Research participation and questionnaire answers will not be used as automatic grounds for employment or payroll decisions.

**Supplementary questionnaire draft to accompany SUS**

This is a researcher-developed draft, not a validated standard instrument. Review it with the planned experts and pilot procedure before final use. Admins and employees answer based on their assigned tasks. Keep the existing ten-item SUS questionnaire unchanged and administer it separately.

Response options: 1 Strongly disagree; 2 Disagree; 3 Neither agree nor disagree; 4 Agree; 5 Strongly agree; N/A Not applicable or not observed.

| Code | Criterion | Statement |
|---|---|---|
| F1 | Functional suitability | WorkPulse provided the functions I needed for my assigned tasks. |
| F2 | Functional suitability | I could find the records or results required for my assigned tasks. |
| F3 | Functional suitability | The functions available to my role supported the workflow demonstrated in this session. |
| P1 | Perceived performance efficiency | WorkPulse responded promptly when I selected an action. |
| P2 | Perceived performance efficiency | The records or pages I requested loaded within an acceptable time. |
| P3 | Perceived performance efficiency | Waiting for the system did not substantially interrupt my assigned tasks. |
| R1 | Perceived reliability | WorkPulse remained available while I performed my assigned tasks. |
| R2 | Perceived reliability | WorkPulse completed the actions I attempted without unexpected errors. |
| R3 | Perceived reliability | Information I saved remained available when I checked it again. |
| S1 | Perceived security | WorkPulse required me to complete the sign-in verification steps before accessing my workspace. |
| S2 | Perceived security | The information and actions shown to me matched the access intended for my role. |
| S3 | Perceived security | The access controls I experienced gave me confidence that my account was protected from unauthorized use. |

Items about perceived security do not prove confidentiality or backend protection. If a participant did not save/revisit records or sign in personally, they should select N/A for the corresponding item. Retain the original open-ended questions about difficulties and improvements after the instruments.

**Alignment checklist**

| Chapter 1 question | Chapter 2 evidence collection | Chapter 3 reporting |
|---|---|---|
| Existing challenges | Boss/manager interviews; actual observations if conducted | Table 2 and documented themes |
| Functional/security requirements | Interview analysis and policy presentation/review | Requirements and policy-decision Tables 3–4 |
| Centralization/workflows | Development records and functional tests | Modules, screenshots, workflow evidence |
| Five quality criteria | SUS + separate supplementary items + technical tests | Role-specific perceptions and technical results |
| Fingerprint accuracy/reliability | Known-identity biometric trials and timing | Correct/wrong/no-match counts, non-enrolled results, failures and timing |

**References to retain or add**

Brooke, J. (1996). SUS: A “quick and dirty” usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, and I. L. McClelland (Eds.), *Usability evaluation in industry* (pp. 189–194). Taylor & Francis.

[MeasuringU: Measuring Usability with the System Usability Scale](https://measuringu.com/sus/) supports using SUS as a perceived-usability measure and its standard scoring, rather than a security or performance certification.

[NIST: A Tale of Two Errors—Measuring Biometric Algorithms](https://www.nist.gov/blogs/taking-measure/tale-two-errors-measuring-biometric-algorithms) explains why biometric evaluation must distinguish verification and identification.
