**Chapter 3**

**DISCUSSION OF FINDINGS**

**Working-draft note**

This revision aligns with the five research questions in the supplied Chapter 1 and the development and evaluation activities described in Chapter 2. The working evaluation plan anticipates approximately ten participants; the final number and administrator/employee distribution are not yet confirmed. All blank fields require actual evidence. Instructions in brackets are drafting notes and must be removed from the submitted chapter. The existing standard SUS questionnaire remains a separate research instrument.

**Introduction**

This chapter presents the findings concerning the development and evaluation of WorkPulse: Employee Attendance and Work Analytics Information System for MVL. The discussion is organized according to the study's five research questions: challenges in existing workforce-information processes; functional and security requirements; centralization of records and support for workforce workflows; acceptability in terms of functional suitability, usability, performance efficiency, reliability, and security; and the performance of fingerprint-based attendance identification.

Initial data gathering involved interviews with the company's boss and manager. Interview dates, participants' formal positions, documented responses, and any subsequent clarifications will be reported from the actual records. No initial employee survey results are claimed in this chapter.

User evaluation, system-quality ratings, and biometric performance results have not yet been supplied for this draft. Their results and interpretations remain blank. The final chapter will distinguish management interview evidence, employee and administrator evaluations, and technical test evidence.

**Challenges in the Existing Workforce-Information Processes**

This section addresses Research Question 1: What challenges are encountered in managing employee information, attendance, leave, and payroll through current manual or fragmented processes?

The interviews examined existing procedures, difficulties, responsibilities, and information requirements. Findings will be supported by interview notes or transcripts. Observations will be included only where an actual observation date and record are available. Interview findings will not be converted into frequencies or percentages implying a survey of thirty employees.

Interview dates: __________  
Interviewee codes and formal positions: __________  
Supporting interview records: __________  
Observation dates and supporting records, if conducted: __________

**Table 2. Interview Questions and Documented Findings**

| No. | Area | Interview or follow-up question | Actual finding and supporting source |
|---|---|---|---|
| 1 | Responsibilities | Who maintains employee records and handles attendance, leave, and payroll? | __________ |
| 2 | Employee information | How are records stored, updated, and retrieved? What works well and what difficulties occur? | __________ |
| 3 | Attendance | How do employees record arrival and departure, and how are missing or incorrect entries handled? | __________ |
| 4 | Identity checking | How is an attendance entry linked to the correct employee? What difficulties have occurred? | __________ |
| 5 | Work hours | How are work hours, lateness, absences, breaks, and overtime determined? | __________ |
| 6 | Leave | How are leave requests, decisions, eligibility, and balances managed? | __________ |
| 7 | Payroll | How is payroll prepared and checked? Which rates, additions, deductions, and exceptions apply? | __________ |
| 8 | Employee access | How do employees obtain or question their attendance, leave, and payroll information? | __________ |
| 9 | Reports | Which workforce reports are needed, and how are they currently prepared? | __________ |
| 10 | Access control | Who may view or change each type of record, and how are changes reviewed? | __________ |
| 11 | Workload | Which processes require the most repeated work? Can you describe an example? | __________ |
| 12 | Rules and exceptions | Which company policies must WorkPulse follow? How are exceptional cases authorized? | __________ |
| 13 | Intended users | Who will use administrator functions and who will use employee functions? | __________ |
| 14 | Operating conditions | What devices, connectivity, training, and fallback arrangements are available? | __________ |

[Use existing interview evidence where it answers a question. Do not retrospectively claim this exact guide was used. Record newly asked questions as follow-up interviews. Keep this question column as requested, or move the full guide to an appendix if required by the school.]

**Discussion of Findings from the Existing Process**

Verified theme or challenge: __________  
Supporting interview/observation evidence: __________  
Operational implication: __________

Verified theme or challenge: __________  
Supporting interview/observation evidence: __________  
Operational implication: __________

Additional documented themes: __________

These findings reflect the perspectives and processes actually examined. Management interviews alone do not establish the percentage of employees experiencing a particular difficulty.

**Functional, Security, and Workforce-Policy Requirements**

This section addresses Research Question 2: What functional and security requirements should WorkPulse provide for administrators and employees?

Interview findings will be linked to requirements and acceptance criteria. Proposed workforce policies will be presented to management for review before they are treated as approved company rules. Existing software defaults will be distinguished from management-approved values.

**Table 3. Requirements Derived from Documented Evidence**

| Requirement ID | Verified need and evidence reference | Resulting requirement | Acceptance criterion | Management confirmation | Implementation status |
|---|---|---|---|---|---|
| R-01 | __________ | Employee information management | __________ | __________ | __________ |
| R-02 | __________ | Fingerprint attendance and record monitoring | __________ | __________ | __________ |
| R-03 | __________ | Leave application, review, and balances | __________ | __________ | __________ |
| R-04 | __________ | Payroll workflows and employee summaries | __________ | __________ | __________ |
| R-05 | __________ | Employee self-service and record ownership | __________ | __________ | __________ |
| R-06 | __________ | Authentication, authorization, session/request protection | __________ | __________ | __________ |
| R-07 | __________ | Validation, audit records, and protected storage | __________ | __________ | __________ |
| R-08 | __________ | Descriptive dashboards and reports | __________ | __________ | __________ |
| R-09 | __________ | Company settings and operational exceptions | __________ | __________ | __________ |

The requirement labels reflect the study's stated scope; evidence and confirmation fields must be completed before describing them as interview-derived requirements.

**Presentation and Review of Proposed Policies**

The policy review will cover account responsibilities, passwords and recovery, fingerprint handling, schedules, attendance exceptions, leave rules, payroll calculations, payment recording, retention, backup, and maintenance. Researchers will demonstrate the related WorkPulse functions and record whether management accepts, revises, or defers each proposal.

Policy presentation date: __________  
Attendees and roles: __________  
Policy document/version presented: __________  
Meeting record reference: __________

**Table 4. Management Review of Proposed WorkPulse Policies**

| Policy area | Existing company rule/evidence | Proposed WorkPulse rule | Management decision and approved value | Required system change | Effective date |
|---|---|---|---|---|---|
| Accounts, passwords, and access | __________ | __________ | __________ | __________ | __________ |
| Fingerprint use and fallback | __________ | __________ | __________ | __________ | __________ |
| Schedules, lateness, breaks, and corrections | __________ | __________ | __________ | __________ | __________ |
| Leave eligibility, allowance, approval, and pay treatment | __________ | __________ | __________ | __________ | __________ |
| Payroll rates, components, cutoff, and payment | __________ | __________ | __________ | __________ | __________ |
| Retention, backup, and maintenance | __________ | __________ | __________ | __________ | __________ |

Discussion of confirmed requirements and unresolved decisions: __________

Policy approval establishes agreed requirements; it is separate from SUS and does not demonstrate usability or technical correctness.

**Centralized Records and Implemented Workflows**

This section addresses Research Question 3: How can the system centralize workforce records and support attendance monitoring, leave processing, payroll workflows, and employee self-service?

WorkPulse uses a browser interface, an application backend, and a MongoDB Atlas database to support linked workforce records. The discussion below will identify the implemented behavior of the version tested and show supporting screenshots or test records. The existence of a feature will not, by itself, be described as proof of improved efficiency or accuracy.

System version/build: __________  
Evaluation environment: __________  
Approved requirement baseline: __________

**Table 5. Module Implementation and Supporting Evidence**

| Module/control | Intended contribution to the study | Actual behavior/status in tested version | Evidence |
|---|---|---|---|
| Employee information | Centralized employee records linked by identifier | __________ | Figure 3 / __________ |
| Fingerprint attendance | Identify an enrolled employee before attendance recording | __________ | Figure 4 / __________ |
| Attendance monitoring | View attendance for a selected date | __________ | Figure 5 / __________ |
| Employee portal | Access personal authorized workforce records | __________ | Figure 6 / __________ |
| Leave management | Submit, review, and record leave decisions | __________ | Figure 7 / __________ |
| Payroll management | Prepare/review payroll under agreed calculation rules | __________ | Figure 8 / __________ |
| Payroll summary/payslip | Make authorized payroll information accessible | __________ | Figure 9 / __________ |
| Descriptive dashboard | Summarize stored workforce information | __________ | Figure 10 / __________ |
| Role and ownership restrictions | Separate admin functions and employee-owned records | __________ | Figure 11 / __________ |
| Authentication/session controls | Manage sign-in, verification, and sessions | __________ | Figure 12 / __________ |
| Audit logging | Record selected significant actions | __________ | Figure 13 / __________ |
| Validation/request protection | Reject specified invalid or unauthorized requests | __________ | Figure 14 / __________ |
| Cloud storage | Maintain linked workforce records | __________ | Figure 15 / __________ |
| Company/system settings | Apply approved configurable rules | __________ | Figure 16 / __________ |

[Insert Figures 3–16 with the corresponding captions above, only where actual screenshots/diagrams are available. Mask personal information and secrets. Explain each module's actual behavior and the linked requirement.]

Daily attendance filtering is included in the supplied Chapter 2. Date-range filtering remains outside completed claims unless its implementation and tests are documented and Chapter 2 is updated. Forecasts or other predictive features will not be claimed as evaluated descriptive analytics; including them requires consistent revisions to scope, objectives, and methods.

Evidence that records and workflows are linked correctly: __________  
Outstanding/backlog functions: __________  
Any measured comparison with the previous process, if actually conducted: __________

**System Acceptability and Quality Evaluation**

This section addresses Research Question 4: How acceptable is the developed system in terms of functional suitability, usability, performance efficiency, reliability, and security?

The evaluation combines role-appropriate user feedback with documented technical tests. SUS measures perceived usability. A separate researcher-developed questionnaire addresses observable functional suitability, perceived performance efficiency, perceived reliability, and perceived security. Objective response times, correct outputs, access restrictions, and recovery behavior will be assessed through technical tests rather than inferred from user agreement.

**Participants and Evaluation Coverage**

Final approved recruitment method: __________  
Eligibility criteria: __________  
Evaluation dates: __________  
Training/introduction provided: __________  
Test data used: __________

Approximately ten intended users are anticipated for evaluation, subject to confirmation of eligibility, actual user roles, availability, and voluntary participation. This is a planning estimate, not a completed sample or a verified workforce count. The revised methodology proposes purposive selection to cover actual administrative and employee workflows; it does not claim total enumeration. The final eligible population, invitation count, and completed responses will be documented. A manager's organizational title does not determine their system permissions.

**Table 6. Actual Participation by Organizational Position**

| Position | Eligible population confirmed | Invited | Completed task testing | Complete SUS questionnaires | Usable supplementary questionnaires |
|---|---|---|---|---|---|
| Manager | __________ | __________ | __________ | __________ | __________ |
| Other regular staff | __________ | __________ | __________ | __________ | __________ |
| Student/part-time employees | __________ | __________ | __________ | __________ | __________ |
| Other actual admin users, if outside the above groups | __________ | __________ | __________ | __________ | __________ |
| Total unique participants | __________ | __________ | __________ | __________ | __________ |

**Table 7. Evaluation Coverage by System Role**

| WorkPulse role tested | Actual participants | Workflows tested | Evidence reference |
|---|---|---|---|
| Administrator | __________ | __________ | __________ |
| Employee | __________ | __________ | __________ |

A person appearing in both role-specific evaluations will be identified by the same participant code and counted once in the unique-person total. Role-specific sessions will be described separately rather than treated as independent people. If only one administrator participates, that person's SUS score will be reported individually.

**Instrument Review and Pilot Testing**

Chapter 2 proposes review by three qualified experts and a separate pilot. Their completion will be reported only when supporting records exist. The standard SUS instrument will be distinguished from the researcher-developed supplementary questions.

**Table 8. Instrument Review and Pilot Evidence**

| Activity | Actual participants/count | Date | Findings and revisions | Evidence |
|---|---|---|---|---|
| Expert review of supplementary items/task materials | __________ | __________ | __________ | __________ |
| Pilot with people outside the final evaluation | __________ | __________ | __________ | __________ |
| Internal consistency for applicable multi-item scales | __________ | __________ | __________ | __________ |

Scale name/item set: __________  
Number of pilot responses analyzed: __________  
Actual coefficient, if estimated: __________  
Limitations of the estimate: __________

No coefficient will be invented, and unrelated quality constructs will not be combined into a single reliability statistic without justification. If the planned validation/pilot is not performed, this must be resolved in Chapter 2 and reported transparently.

**Task-Based User Evaluation**

**Table 9. Role-Appropriate User Tasks**

| Code | Role | Proposed task | Success criterion to finalize before testing |
|---|---|---|---|
| A1 | Admin | Add or update a designated test employee | Required values saved and retrievable |
| A2 | Admin | Locate attendance for a specified day | Correct day's records displayed |
| A3 | Admin | Review and decide a test leave request | Intended decision and dates recorded |
| A4 | Admin | Prepare/review a test payroll record | Correct record found; values compared with independent expected results |
| A5 | Admin | Locate a descriptive report and answer a specified question | Correct report and supported answer |
| A6 | Admin | Apply an approved test setting | Authorized value saved and specified behavior observed |
| E1 | Employee | Record attendance through the fingerprint kiosk | Correct identity and intended attendance action |
| E2 | Employee | Sign in and view personal attendance | Authorized record located |
| E3 | Employee | Submit a designated test leave request | Intended dates/reason saved |
| E4 | Employee | Locate personal payroll information | Correct authorized record located |

**Table 10. Observed Task Results**

| Participant code | Role | Task | Independent/assisted/not completed | Time, if measured | Error/assistance/comment |
|---|---|---|---|---|---|
| __________ | __________ | __________ | __________ | __________ | __________ |

[Add every attempted participant-task combination; distinguish unattempted tasks. Define timing boundaries and assistance rules before testing.]

Task completion findings: __________  
Administrative workflow difficulties: __________  
Employee workflow difficulties: __________

**SUS Usability Results**

Participants will complete the separate standard ten-item SUS questionnaire after their assigned hands-on tasks. For each complete questionnaire, responses to odd-numbered items are reduced by one; even-numbered responses are subtracted from five. The adjusted total is multiplied by 2.5. Scores range from 0–100 and are not percentages. The mean is calculated from individual scores within each role group. Incomplete questionnaires will be reported separately under the prespecified missing-response procedure.

**Table 11. SUS Results by Role**

| Role | Complete questionnaires | Mean score, or individual score when n = 1 | Minimum–maximum | Standard deviation when estimable |
|---|---|---|---|---|
| Administrator | __________ | __________ | __________ | __________ |
| Employee | __________ | __________ | __________ | __________ |

Published interpretation reference selected before final analysis: __________  
Administrative interpretation: __________  
Employee interpretation: __________  
Supporting observations and limitations: __________

Employee scores will not be used to establish the usability of untested administrative functions. Role-specific results will not be averaged together merely to hide differences in workflow or sample size. No formal claim that one role's experience is statistically better will be made without a suitable design and analysis.

**Supplementary Quality Perceptions**

Participants will rate only applicable aspects they actually experienced. The supplementary instrument uses 1 = Strongly disagree through 5 = Strongly agree, with a separate Not applicable/not observed option. Not applicable and missing responses are not scored as zero or neutral. These items are separate from SUS.

**Table 12. Supplementary Quality Ratings**

| Role | Criterion | Applicable response count and item coverage | Mean agreement rating | Interpretation and limitation |
|---|---|---|---|---|
| Admin | Functional suitability | __________ | __________ | __________ |
| Employee | Functional suitability | __________ | __________ | __________ |
| Admin | Perceived performance efficiency | __________ | __________ | __________ |
| Employee | Perceived performance efficiency | __________ | __________ | __________ |
| Admin | Perceived reliability | __________ | __________ | __________ |
| Employee | Perceived reliability | __________ | __________ | __________ |
| Admin | Perceived security | __________ | __________ | __________ |
| Employee | Perceived security | __________ | __________ | __________ |

Discussion: __________

These are agreement ratings about observed experience, not a technical certification or automatic finding that all quality criteria have passed. SUS remains the usability measure and will not be mixed arithmetically with the 1–5 category means.

**Technical Quality Results**

Technical tests will use documented inputs, expected outcomes, test conditions, and actual evidence. Performance targets will be established before final testing rather than selected to fit observed results.

**Table 13. Functional, Reliability, and Security Test Results**

| Test area | Expected behavior/test design | Actual result | Pass/fail/not tested | Evidence |
|---|---|---|---|---|
| Employee records | Save/retrieve a designated record accurately | __________ | __________ | __________ |
| Daily attendance filtering | Return only the selected day's intended records | __________ | __________ | __________ |
| Attendance rules | Apply approved scan/session/schedule rules | __________ | __________ | __________ |
| Leave | Apply documented dates, balance, overlap, and decision rules | __________ | __________ | __________ |
| Payroll | Match independently calculated test cases under approved rules | __________ | __________ | __________ |
| Descriptive reports | Match independently counted source records | __________ | __________ | __________ |
| Authentication and OTP | Accept valid and reject invalid/expired conditions | __________ | __________ | __________ |
| Role/record ownership | Reject employee access to admin functions/another employee's records | __________ | __________ | __________ |
| Session/logout | Reject expired or revoked sessions | __________ | __________ | __________ |
| Request protection/validation | Reject specified missing protection or invalid inputs | __________ | __________ | __________ |
| Audit events | Record expected details for designated actions | __________ | __________ | __________ |
| Repeated operations | Maintain correct results and avoid unintended duplicates under defined repetitions | __________ | __________ | __________ |
| Failure handling | Handle specified network/scanner/service failure and recovery | __________ | __________ | __________ |
| Backup restoration, if performed | Restore selected data and verify counts/content in a test environment | __________ | __________ | __________ |

**Table 14. Measured Application Performance**

| Operation | Device/network/load conditions | Trials | Timing boundaries | Predefined target | Observed mean and range | Finding |
|---|---|---|---|---|---|---|
| __________ | __________ | __________ | __________ | __________ | __________ | __________ |

Functional suitability findings: __________  
Performance findings: __________  
Reliability findings: __________  
Security-control findings: __________

The results establish only the behavior examined under the documented conditions. User confidence in security does not establish technical resistance to attacks. Backup export alone does not establish successful restoration.

**Fingerprint Attendance Performance**

This section addresses Research Question 5: How accurately and reliably does the integrated fingerprint process authenticate employee attendance?

WorkPulse searches a submitted fingerprint against an enrolled gallery rather than merely comparing it with a claimed employee identity. The evaluation therefore records the expected employee identity, returned identity, match decision, and attendance outcome. An accepted scan assigned to the wrong enrolled employee will be counted as an error, not a successful genuine acceptance.

Reader actually tested: __________  
Matcher/version: __________  
Threshold fixed for final evaluation: __________  
Number of enrolled identities in the gallery: __________  
Number of people providing evaluation scans: __________  
Attempts per person and conditions: __________  
Capture/retry/failure definitions: __________  
Evaluation dates and software version: __________

Enrollment samples and final evaluation captures will be separate. Enrolled-person trials and authorized non-enrolled-probe trials will be distinguished. An enrolled employee scanning their own finger is not a non-enrolled trial in a one-to-many system. Capture failures, matcher failures, and policy-based attendance denials will be reported separately.

**Table 15. Fingerprint Trial Record**

| Trial | Participant code | Enrolled/non-enrolled probe | Expected identity/outcome | Returned identity/no match | Capture/matcher status | Attendance outcome | Response time |
|---|---|---|---|---|---|---|---|
| __________ | __________ | __________ | __________ | __________ | __________ | __________ | __________ |

**Table 16. Fingerprint Evaluation Summary**

| Measure | Count/result |
|---|---|
| Enrolled-person searches successfully submitted to the matcher (G) | __________ |
| Correct employee returned and accepted (C) | __________ |
| Wrong enrolled employee returned and accepted (W) | __________ |
| No identity accepted on an enrolled-person search (R) | __________ |
| Non-enrolled searches successfully submitted (U) | __________ |
| Non-enrolled searches incorrectly accepted as any employee (F) | __________ |
| Non-enrolled searches correctly rejected | __________ |
| Failed capture attempts before matching | __________ |
| Matcher/service failures | __________ |
| Correct identity but attendance action denied by a documented policy | __________ |
| Incorrect attendance records despite a correct identity result | __________ |
| Matcher response time, with sample count and range | __________ |
| End-to-end attendance time, with sample count and range | __________ |

Operational measures:

- Correct identification rate on enrolled searches = C / G × 100.
- Wrong-identity acceptance rate on enrolled searches = W / G × 100.
- No-match rate on enrolled searches = R / G × 100.
- False-positive identification proportion on non-enrolled searches = F / U × 100.
- For completed enrolled-search decisions, G = C + W + R. Trials with capture/matcher failure must be accounted for separately.

Report numerator and denominator for every rate. A zero denominator means Not evaluated, not 0%. Repeated attempts are trials, not additional participants. Zero observed errors do not establish zero error probability outside the test conditions. The displayed biometric match-strength score will not be substituted for measured accuracy. Response-time boundaries will distinguish matching time from capture, network, and database time.

Fingerprint findings and observed failure conditions: __________  
Limitations concerning gallery size, people, attempts, and conditions: __________

**Issues, Refinements, and Retesting**

**Table 17. Issues and Actions Following Evaluation**

| Issue | Supporting evidence | Requirement/workflow affected | Change or action | Version/date | Retest result |
|---|---|---|---|---|---|
| __________ | __________ | __________ | __________ | __________ | __________ |

Issues corrected and verified: __________  
Unresolved issues and backlog items: __________

Repeated testing on a revised version will be identified separately; pre-change and post-change scores will not be silently pooled.

**Limitations**

The findings are limited to the organization, participants, system version, workflows, and test conditions documented above. Management interviews represent the interviewed personnel's perspectives. Participant nonresponse and role coverage will be reported. One administrator's results cannot establish a general distribution of administrator experience.

SUS and supplementary ratings measure perceptions. Technical and biometric tests cover the conditions actually examined. Simulated records will be identified, and measured differences from the previous process will be claimed only if a suitable comparison was conducted.

Actual limitations: __________

**Findings in Relation to the Research Questions**

**Table 18. Summary of Evidence by Research Question**

| Research question | Actual finding | Main evidence | Remaining limitation |
|---|---|---|---|
| 1. Existing process challenges | __________ | __________ | __________ |
| 2. Functional/security requirements | __________ | __________ | __________ |
| 3. Centralized workflow support | __________ | __________ | __________ |
| 4. Five quality criteria | __________ | __________ | __________ |
| 5. Fingerprint attendance performance | __________ | __________ | __________ |

**Method references for the final bibliography**

Brooke, J. (1996). SUS: A “quick and dirty” usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, and I. L. McClelland (Eds.), *Usability evaluation in industry* (pp. 189–194). Taylor & Francis.

[MeasuringU: Measuring Usability with the System Usability Scale](https://measuringu.com/sus/).

[NIST: A Tale of Two Errors—Measuring Biometric Algorithms](https://www.nist.gov/blogs/taking-measure/tale-two-errors-measuring-biometric-algorithms). This source explains the distinction between verification and identification errors; the operational counts above must be interpreted according to the actual WorkPulse test protocol.
