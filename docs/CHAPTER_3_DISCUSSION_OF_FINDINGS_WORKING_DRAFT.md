# Chapter 3

# DISCUSSION OF FINDINGS

> **Working-draft notice — remove before submission:** This chapter is a project-specific replacement for the SmartTasker template. Every bracketed field must be replaced with verified evidence. Do not invent respondent counts, percentages, weighted means, SUS scores, test results, biometric accuracy, FAR, FRR, processing times, or quotations. Delete sections that were not actually evaluated. Confirm with the adviser that results belong in Chapter 3 because the present Chapter 2 file already contains the methodology.

## Introduction

This chapter presents and discusses the findings of the study on the development and evaluation of **WorkPulse: Employee Attendance and Work Analytics Information System for MVL**. The findings are organized according to the statement of the problem and objectives of the study. They include the problems and requirements identified in the existing workforce-information processes, the functional and security requirements of the system, the implemented WorkPulse modules, the results of technical and user evaluation, the performance of fingerprint verification, and the operational and usability issues encountered by participants. Survey results are presented through frequencies, percentages, and weighted means; interview and observation findings are organized into recurring themes; and technical conclusions are based on documented system and biometric tests.

## Problems and Requirements in the Existing Processes

This section presents the problems and requirements identified in MVL's existing employee-information, attendance, leave, and payroll processes. The evidence was gathered through [observation dates], a semi-structured interview with [authorized role], and an initial needs-assessment questionnaire completed by [number] of [number invited] eligible participants. Only valid responses were included in the calculations.

### Profile of Needs-Assessment Participants

**Table 1**  
*Profile of Needs-Assessment Participants*

| Respondent category | Invited | Valid responses | Percentage |
|---|---:|---:|---:|
| Manager | [ ] | [ ] | [ ]% |
| Regular staff | [ ] | [ ] | [ ]% |
| Student/part-time employees | [ ] | [ ] | [ ]% |
| **Total** | **[ ]** | **[ ]** | **100.00%** |

The table shows that [interpret the distribution without identifying individuals]. The response rate was [valid responses / invited × 100] percent. Because the study concerns one organization and uses [total enumeration/adviser-approved sampling], the findings describe the participating MVL population and should not be generalized automatically to other workplaces.

### Problems Encountered in the Current Process

Use one row per actual questionnaire item or coded interview/observation theme. If participants could select more than one answer, state that percentages will not total 100 percent.

**Table 2**  
*Problems Encountered in the Existing Workforce-Information Process*

| Problem or issue | Frequency | Percentage | Supporting source |
|---|---:|---:|---|
| [Attendance records require manual or repeated encoding] | [ ] | [ ]% | [survey/interview/observation] |
| [Employee, attendance, leave, and payroll information is fragmented] | [ ] | [ ]% | [ ] |
| [Employees have limited access to their own records] | [ ] | [ ]% | [ ] |
| [Attendance identity cannot always be adequately verified] | [ ] | [ ]% | [ ] |
| [Reports take time to consolidate] | [ ] | [ ]% | [ ] |
| [Other verified issue] | [ ] | [ ]% | [ ] |

The most frequently identified concern was **[issue]**, selected by [frequency] participants ([percentage]%). [Explain the operational consequence and connect it to a WorkPulse requirement.] The second recurring concern was **[issue]**, reported by [frequency] participants ([percentage]%). [Explain.] Interview and observation evidence [confirmed/differed from] these survey results because [brief evidence].

> Report evidence, not assumptions. Do not state that WorkPulse improved these processes in this section unless a before-and-after measure was actually collected.

### Requirements Derived from the Findings

**Table 3**  
*Traceability of Identified Problems to WorkPulse Requirements*

| Evidence ID | Verified problem or need | Resulting requirement | Priority | Implementation status |
|---|---|---|---|---|
| E-01 | [ ] | Centralized employee, attendance, leave, and payroll records | [High/Medium/Low] | [Implemented/Partial/Proposed] |
| E-02 | [ ] | Employee self-service access restricted to owned records | [ ] | [ ] |
| E-03 | [ ] | Fingerprint-verified time-in and time-out with fallback procedure | [ ] | [ ] |
| E-04 | [ ] | Role-based access, authentication, and audit logging | [ ] | [ ] |
| E-05 | [ ] | Descriptive dashboards and explainable analytical insights | [ ] | [ ] |

The evidence led to the prioritization of [requirements]. This traceability table demonstrates how the implemented features respond to verified organizational needs rather than merely listing available software functions.

## Functional and Security Requirements of WorkPulse

The required functions were grouped according to administrator and employee responsibilities. The administrator requirements included [verified administrator functions]. Employee requirements included [verified employee functions]. Non-functional and security requirements included authentication using password, CAPTCHA, and email one-time password; role and record-ownership authorization; session protection; input validation; rate limiting; audit logging; protected biometric-template handling; and appropriate privacy and retention procedures.

**Table 4**  
*Summary of Functional and Security Requirements*

| Requirement ID | Requirement | Intended user | Acceptance condition | Status |
|---|---|---|---|---|
| FR-01 | Manage employee records | Administrator | Authorized administrator can create, view, update, and [archive/delete if implemented] records | [ ] |
| FR-02 | Record fingerprint-verified attendance | Employee | Valid scan records a permitted time-in/time-out sequence | [ ] |
| FR-03 | Process leave requests | Administrator/Employee | Employee submits; administrator reviews; status is visible | [ ] |
| FR-04 | View authorized payroll information | Administrator/Employee | Each role sees only permitted payroll records | [ ] |
| FR-05 | Generate descriptive dashboards and reports | Administrator | Stored data are summarized accurately | [ ] |
| SR-01 | Enforce authentication and authorization | All roles | Unauthorized requests are rejected and logged where appropriate | [ ] |
| SR-02 | Protect biometric templates | Authorized process | Templates are stored and processed according to the implemented protection design | [ ] |

## Developed WorkPulse System

This section presents only features demonstrated in the tested build. Each screenshot must hide real names, email addresses, employee IDs, payroll amounts, tokens, biometric data, and other confidential information. Use seeded or properly anonymized demonstration records.

### Authentication and Account Protection

WorkPulse provides protected authentication using [confirmed implemented controls]. These controls are intended to limit unauthorized access and establish an authenticated session before a user reaches role-permitted functions.

**Figure 1**  
*WorkPulse Login and Verification Interface*

![Insert a sanitized screenshot of the login and verification interface.](images/chapter-3/figure-01-login.png)

Figure 1 shows [describe what is visibly demonstrated and why it addresses SR-01].

### Administrator Dashboard and Employee Management

The administrator workspace centralizes [confirmed functions]. The employee-management module permits authorized personnel to [confirmed operations] while restricting these operations from employee accounts.

**Figure 2**  
*Administrator Dashboard and Employee Management Module*

![Insert a sanitized screenshot.](images/chapter-3/figure-02-admin-dashboard.png)

Figure 2 demonstrates [explanation linked to FR-01 and the relevant finding].

### Fingerprint Enrollment and Attendance Kiosk

The fingerprint module supports authorized enrollment and fingerprint-verified time-in and time-out using [scanner model and SDK/version]. Attendance controls reject invalid sequences such as [only list tested controls]. A separate fallback process is available for [state the approved procedure, if any].

**Figure 3**  
*Fingerprint Enrollment and Attendance Kiosk*

![Insert a sanitized screenshot; never include a raw fingerprint image or template.](images/chapter-3/figure-03-attendance-kiosk.png)

Figure 3 shows [capture feedback, accepted/rejected result, and sequence control]. Its presence demonstrates implementation, but biometric accuracy is established only by the controlled results reported later.

### Employee Self-Service Portal

The employee portal allows authenticated employees to access only their authorized profile, attendance, leave, and payroll information. It also supports [confirmed leave submission or other employee operations].

**Figure 4**  
*Employee Self-Service Portal*

![Insert a sanitized screenshot.](images/chapter-3/figure-04-employee-portal.png)

Figure 4 demonstrates [explanation linked to record transparency and ownership restriction].

### Leave and Payroll Modules

The leave module supports [confirmed workflow]. The payroll module supports [confirmed workflow]. These features consolidate related records while maintaining role and ownership boundaries.

**Figure 5**  
*Leave Management Module*

![Insert a sanitized screenshot.](images/chapter-3/figure-05-leave.png)

**Figure 6**  
*Payroll Module*

![Insert a sanitized screenshot.](images/chapter-3/figure-06-payroll.png)

### Descriptive Analytics and AI Insights

WorkPulse presents descriptive workforce summaries and explainable analytical methods. The implemented methods include additive Holt–Winters attendance forecasting, Bradford Factor with time decay, Modified Z-score arrival anomaly detection, and rolling fingerprint-scanner health calculations. These outputs are decision-support information for authorized human review. They are not independent measures of employee productivity and must not automatically determine discipline, payroll, or employment action.

**Figure 7**  
*Descriptive Dashboard and AI Insights*

![Insert a sanitized screenshot.](images/chapter-3/figure-07-analytics.png)

Figure 7 shows [visible output, method/version, inputs or explanation, and human-review notice]. Do not claim forecast accuracy until it has been evaluated against unseen chronological data and an appropriate baseline.

## Functional and Security Test Results

Technical testing was completed before participant evaluation using build [commit/version], browser(s) [ ], operating system [ ], server configuration [ ], and test date(s) [ ]. Test evidence consisted of [screenshots/logs/database checks], stored under [evidence location].

**Table 5**  
*Functional and Security Requirements Traceability Results*

| Test ID | Requirement | Scenario | Expected result | Actual result | Status | Evidence ID |
|---|---|---|---|---|---|---|
| FT-01 | FR-01 | [ ] | [ ] | [ ] | [Pass/Fail/Blocked] | [ ] |
| FT-02 | FR-02 | Duplicate time-in attempt | Attempt is rejected without creating an invalid record | [ ] | [ ] | [ ] |
| FT-03 | FR-02 | Time-out without active time-in | Attempt is rejected | [ ] | [ ] | [ ] |
| ST-01 | SR-01 | Employee requests another employee's record | Request is denied without disclosure | [ ] | [ ] | [ ] |
| ST-02 | SR-01 | Expired or invalid session | Protected request is rejected | [ ] | [ ] | [ ] |
| ST-03 | SR-01 | Repeated protected requests exceed limit | Rate-limit behavior matches configuration | [ ] | [ ] | [ ] |
| ST-04 | SR-01 | Protected action occurs | Required audit event is recorded | [ ] | [ ] | [ ] |

Of [total] test cases, [passed] passed, [failed] failed, and [blocked] were blocked, producing a test-case pass rate of [passed / executed × 100] percent. A pass rate summarizes the defined cases and does not prove the absence of defects or security vulnerabilities. The failed or blocked cases involved [summarize], and the corrective action was [action/retest result].

## Performance Efficiency and Reliability Results

Report performance measurements separately from participant opinions. Define the start and end event of each timing measure, perform repeated trials, and report the environment and data volume.

**Table 6**  
*Performance and Reliability Test Results*

| Operation | Trials | Mean (ms) | Median (ms) | Minimum (ms) | Maximum (ms) | Failures | Test conditions |
|---|---:|---:|---:|---:|---:|---:|---|
| Login/API authentication | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Load employee dashboard | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Submit leave request | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Load payroll history | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| Attendance result after valid capture | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

The results show that [interpret measured values against a predeclared acceptance threshold]. During [number] repeated operations, [number] failures occurred. [Explain recovery behavior and unresolved limitations.] Do not describe the system as “fast” or “reliable” without a defined condition and measured evidence.

## Post-Use Evaluation of WorkPulse

After technical testing, eligible participants used build [version] and performed a standardized task script appropriate to their role. The tasks included [login/OTP], [view profile], [view attendance], [submit leave], [view payroll], and [fingerprint attendance where approved]. The 25-item WorkPulse User Evaluation Questionnaire was administered only after task completion.

### Profile and Participation of Evaluators

**Table 7**  
*Profile of Post-Use Evaluators*

| Respondent category | Population invited | Consented | Completed tasks | Valid questionnaires | Percentage of valid responses |
|---|---:|---:|---:|---:|---:|
| Manager | 1 | [ ] | [ ] | [ ] | [ ]% |
| Regular staff | 10 | [ ] | [ ] | [ ] | [ ]% |
| Student/part-time employees | 19 | [ ] | [ ] | [ ] | [ ]% |
| **Total** | **30** | **[ ]** | **[ ]** | **[ ]** | **100.00%** |

The final evaluation included [number] valid respondents, representing [number / 30 × 100] percent of the defined population. [Explain any non-response, exclusions, incomplete forms, or differences from Chapter 2.] Do not include names in this table.

### Likert Scale and Computation

The project-specific questionnaire uses a five-point scale: 5 = Strongly Agree, 4 = Agree, 3 = Neutral, 2 = Disagree, and 1 = Strongly Disagree. The width of each interpretation interval is:

\[
\frac{5-1}{5}=0.80
\]

The item weighted mean is:

\[
\bar{x}=\frac{5f_5+4f_4+3f_3+2f_2+1f_1}{N}
\]

where \(f_5\) through \(f_1\) are the response frequencies and \(N\) is the number of valid answers for that item. The category mean is the arithmetic mean of its item means only when the items use the same valid-response denominator:

\[
CM=\frac{\sum_{i=1}^{k}\bar{x}_i}{k}
\]

If missing answers produce different denominators, calculate the category result from all valid item responses and disclose the rule used.

| Mean range | Response | Acceptability interpretation |
|---:|---|---|
| 4.21–5.00 | Strongly Agree | Highly Acceptable |
| 3.41–4.20 | Agree | Acceptable |
| 2.61–3.40 | Neutral | Moderately Acceptable |
| 1.81–2.60 | Disagree | Less Acceptable |
| 1.00–1.80 | Strongly Disagree | Not Acceptable |

### Item and Category Results

Create one detailed table for each grouping in the questionnaire. Do not merge categories merely to imitate the SmartTasker example.

**Table 8**  
*Learnability and Ease-of-Use Evaluation*

| Item | 5 | 4 | 3 | 2 | 1 | Valid N | Weighted mean | Interpretation |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1. WorkPulse is easy to understand and use. | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 2. Instructions are clear and easy to follow. | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 3. Buttons, labels, and menus are understandable. | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 4. Navigation among authorized records is easy. | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| 5. The system can be used without excessive assistance. | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| **Category mean** |  |  |  |  |  |  | **[ ]** | **[ ]** |

Prepare the same table format for:

- **Table 9:** Attendance and Fingerprint Use, questionnaire items 6–10;
- **Table 10:** Employee Information, Leave, and Payroll, items 11–15;
- **Table 11:** Speed, Reliability, and Security, items 16–20; and
- **Table 12:** Overall Satisfaction, items 21–25.

**Table 13**  
*Summary of Post-Use Evaluation Results*

| Evaluation grouping | Number of items | Category mean | Response | Acceptability interpretation | Rank |
|---|---:|---:|---|---|---:|
| Learnability and ease of use | 5 | [ ] | [ ] | [ ] | [ ] |
| Attendance and fingerprint use | 5 | [ ] | [ ] | [ ] | [ ] |
| Employee information, leave, and payroll | 5 | [ ] | [ ] | [ ] | [ ] |
| Speed, reliability, and security | 5 | [ ] | [ ] | [ ] | [ ] |
| Overall satisfaction | 5 | [ ] | [ ] | [ ] | [ ] |
| **Overall mean** | **25** | **[ ]** | **[ ]** | **[ ]** |  |

The highest-rated grouping was **[category]** with a mean of [value], interpreted as [interpretation]. This indicates that respondents perceived [careful meaning]. The lowest-rated grouping was **[category]** with a mean of [value]. The item-level responses and comments suggest [specific improvement]. The overall mean of [value] indicates [interpretation] within the tested participants and conditions. These are perceptions and must not be used as proof that security controls, processing speed, or biometric accuracy are technically correct.

### Open-Ended Feedback and Observed Difficulties

**Table 14**  
*Themes from Open-Ended Feedback and Observation*

| Theme | Number of participants mentioning theme | Example paraphrase | Related module | Planned response |
|---|---:|---|---|---|
| [ ] | [ ] | [Do not include identifying details] | [ ] | [ ] |

Describe how answers were coded: [two researchers independently reviewed responses / agreed coding process]. Report recurring themes and important minority concerns. Use a short direct quotation only with consent and anonymous labeling such as “Participant P07.”

## System Usability Scale, If Separately Approved and Administered

> **Important:** The existing 25-item WorkPulse questionnaire is not the System Usability Scale (SUS). Do not label its weighted mean as a SUS score. Include this section only if participants also answer the standard ten SUS items after using WorkPulse and the adviser approves the instrument and reporting approach.

For every participant, convert the original 1–5 SUS responses as follows:

1. For odd-numbered items 1, 3, 5, 7, and 9, contribution = response − 1.
2. For even-numbered items 2, 4, 6, 8, and 10, contribution = 5 − response.
3. Add the ten contributions. The raw contribution total ranges from 0 to 40.
4. Multiply the total by 2.5. The participant's SUS score ranges from 0 to 100.
5. Compute the study mean from the participant-level SUS scores; do not score only from an overall average response.

\[
SUS_i=2.5\left[\sum_{j\in\{1,3,5,7,9\}}(x_{ij}-1)+\sum_{j\in\{2,4,6,8,10\}}(5-x_{ij})\right]
\]

\[
Mean\ SUS=\frac{\sum_{i=1}^{n}SUS_i}{n}
\]

**Table 15**  
*System Usability Scale Results*

| Statistic | Value |
|---|---:|
| Valid SUS respondents | [ ] |
| Mean SUS score | [ ] |
| Standard deviation | [ ] |
| Median | [ ] |
| Minimum | [ ] |
| Maximum | [ ] |
| Benchmark/adjective interpretation and cited source | [ ] |

A SUS score is not a percentage, and an adjective or acceptability label must use one consistently cited benchmark framework. Report the score as: “The participants obtained a mean SUS score of [value] (SD = [value]) under the tested conditions.” Avoid claiming universal usability from a small, single-organization sample.

## Fingerprint Verification Results

Include this section only after the fingerprint scanner, enrollment, matching process, threshold, consent, and controlled test protocol are operational. Preference for fingerprint use is not biometric-performance evidence.

### Test Configuration and Trial Accounting

Report scanner model [ ], SDK/driver/version [ ], matching mode [one-to-one/one-to-many], threshold [ ], template/preprocessing version [ ], number enrolled [ ], finger(s) used [ ], dates [ ], environmental conditions [ ], and whether enrollment samples were separated from evaluation attempts.

**Table 16**  
*Fingerprint Trial Outcomes*

| Ground truth | System accepted | System rejected | Valid comparisons |
|---|---:|---:|---:|
| Genuine employee | True acceptances (TP): [ ] | False rejections (FN): [ ] | [ ] |
| Controlled impostor | False acceptances (FP): [ ] | True rejections (TN): [ ] | [ ] |
| **Total** | **[ ]** | **[ ]** | **[ ]** |

Failed captures are excluded from valid comparisons and reported separately:

| Capture measure | Count |
|---|---:|
| Total physical capture attempts | [ ] |
| Failed captures | [ ] |
| Valid comparisons | [ ] |

\[
FAR=\frac{FP}{FP+TN}\times100\%,\qquad
FRR=\frac{FN}{TP+FN}\times100\%
\]

\[
FCR=\frac{Failed\ Captures}{Total\ Physical\ Capture\ Attempts}\times100\%
\]

\[
Accuracy=\frac{TP+TN}{TP+TN+FP+FN}\times100\%
\]

**Table 17**  
*Fingerprint Performance Summary*

| Measure | Numerator/denominator | Result |
|---|---|---:|
| FAR | [FP] / [FP + TN] | [ ]% |
| FRR | [FN] / [TP + FN] | [ ]% |
| Failed-capture rate | [failed captures] / [physical attempts] | [ ]% |
| Accuracy | [TP + TN] / [valid comparisons] | [ ]% |
| Mean processing time | [definition and valid timed trials] | [ ] ms |
| Minimum–maximum processing time | [ ] | [ ]–[ ] ms |

Interpret FAR and FRR separately. For example, a low FRR does not compensate for an unacceptable FAR. State the confidence limitation caused by the number and composition of trials. Never have participants reproduce or use another person's fingerprint; impostor testing uses their own non-enrolled finger or another consenting participant's own finger according to the approved protocol.

### Operational and Usability Issues in Fingerprint Attendance

**Table 18**  
*Observed Fingerprint-Attendance Issues*

| Issue | Occurrences | Conditions | System response | Resolution or recommendation |
|---|---:|---|---|---|
| Failed capture | [ ] | [ ] | [ ] | [ ] |
| False rejection | [ ] | [ ] | [ ] | [ ] |
| Delayed result | [ ] | [ ] | [ ] | [ ] |
| Invalid attendance sequence | [ ] | [ ] | [ ] | [ ] |
| User required assistance | [ ] | [ ] | [ ] | [ ] |

## Synthesis of Findings by Research Question

**Table 19**  
*Evidence-Based Answers to the Statement of the Problem*

| Research question | Main finding | Evidence |
|---|---|---|
| 1. Problems and requirements in existing processes | [ ] | Tables 1–3; interview/observation themes |
| 2. Functional and security requirements | [ ] | Table 4 |
| 3. Centralized system and supported workflows | [ ] | Figures 1–7; Tables 4–5 |
| 4. Acceptability by quality criteria | [ ] | Tables 7–14; Table 15 only if SUS was used |
| 5. Fingerprint accuracy and reliability | [ ] | Tables 16–17, or “not evaluated” with reason |
| 6. Fingerprint operational and usability issues | [ ] | Table 18 and participant feedback |

Taken together, the findings indicate that [bounded conclusion supported by the listed evidence]. The findings do not establish [state key boundaries such as generalizability, elimination of all security risk, employee productivity improvement, or certified biometric performance].

## Limitations of the Findings

The interpretation of the findings is subject to [actual limitations]. Likely limitations to verify include the small population of one organization, short evaluation period, role-specific task exposure, network and email-service dependency, selected scanner and threshold, limited biometric trial count, use of simulated records for privacy, and the lack of long-term operational data. Only retain limitations that actually apply.

---

# Phased Completion Guide

## Phase 0 — Confirm the Required Chapter Structure

**Goal:** prevent a chapter-numbering conflict before collecting or rewriting evidence.

1. Show the adviser the current structure: Chapter 1 is Introduction, Chapter 2 is Methodology, and the supplied template calls Chapter 3 Discussion of Findings.
2. Ask for written confirmation that Chapter 3 should contain results and discussion rather than methodology.
3. Confirm whether the exact required title is “Discussion of Findings,” “Results and Discussion,” or another institutional title.
4. Confirm whether SUS is mandatory, optional, or not required.
5. Confirm whether the existing 25-item questionnaire is acceptable and whether it must be described using ISO/IEC 25010 quality characteristics.
6. Record the approved table/figure caption style, decimal places, citation style, and whether appendices must contain blank instruments and raw summary tables.

**Deliverable:** one-page adviser decision log containing the approved chapter order and instruments.

## Phase 1 — Build an Evidence Inventory and Freeze the Evaluation Build

**Goal:** know what exists, what is pending, and exactly which system version is evaluated.

1. Create folders for approvals, blank instruments, anonymized raw data, calculations, screenshots, functional tests, security tests, performance tests, biometric trials, and analysis outputs.
2. Assign anonymous participant IDs such as P01–P30. Store the identity-to-code list separately with restricted access.
3. Record the Git commit/build identifier, deployment URL/environment, browser versions, database state, scanner model, SDK/driver version, and matching threshold.
4. Create a requirements traceability matrix using the Chapter 1 objectives and Statement of the Problem.
5. Mark every feature as implemented, partially implemented, proposed, or unavailable. Do not let proposed items appear as completed findings.
6. Prepare simulated/anonymized accounts and records for screenshots and task testing.

**Exit check:** every Chapter 1 research question has at least one planned evidence source.

## Phase 2 — Secure Approval, Validate Instruments, and Pilot Test

**Goal:** ensure ethical and usable data collection.

1. Obtain organizational and school/research approval required for interviews, observation, questionnaires, and biometric trials.
2. Prepare informed consent for general evaluation and a separate biometric notice/consent process.
3. Specify what biometric information is captured, its purpose, access, storage protection, retention, deletion, withdrawal procedure, risks, and fallback attendance method.
4. Ask three qualified IT/software-engineering reviewers to assess each project-specific item for relevance, clarity, neutrality, and alignment. Preserve their forms and revisions.
5. Pilot the final Likert questionnaire with people outside the final respondent group. Do not reuse pilot participants in the final evaluation.
6. Encode pilot answers and calculate Cronbach's alpha only from actual applicable items. If reliability is weak, inspect ambiguous or mixed-purpose items, revise with the adviser, and repeat the pilot if required.
7. If SUS is approved, use the unchanged standard ten-item instrument from an authorized/citable source and pilot the administration workflow. Keep SUS responses separate from the 25-item instrument.
8. Test the task script, timing sheet, observation checklist, and data-entry workbook before recruiting final respondents.

**Exit check:** final instruments have version numbers and approval dates; consent and privacy procedures are ready.

## Phase 3 — Gather Existing-Process and Requirements Evidence

**Goal:** answer Research Questions 1 and 2.

1. Invite the full defined population: 1 manager, 10 regular staff, and 19 student/part-time employees, unless the adviser approves a documented change.
2. Record invited, excluded, consented, completed, and valid-response counts separately.
3. Conduct the initial needs assessment before participants are influenced by the final system, if it has not already been completed.
4. Conduct the manager interview with permission to take notes or record.
5. Observe the actual attendance, employee-record, leave, payroll, and reporting workflows using a checklist.
6. Transcribe or summarize evidence using participant codes. Remove identifying and unnecessary sensitive details.
7. Calculate frequency and percentage for each survey option: frequency ÷ valid respondents for that item × 100.
8. For “select all that apply” questions, add a table note that totals may exceed 100 percent.
9. Code interview and open-ended responses into recurring themes. Have another researcher check the coding where practical.
10. Map each supported problem to a functional or security requirement and implementation status.

**Exit check:** Tables 1–4 can be completed with real data and traceable source records.

## Phase 4 — Perform Technical System Tests

**Goal:** establish system behavior independently from user opinion.

1. Write test cases for every functional requirement with a unique ID, precondition, exact action, expected result, actual result, status, and evidence ID.
2. Test administrator and employee workflows separately.
3. Include negative cases: incorrect password/OTP, invalid or expired session, employee access to another employee's record, direct API access, invalid input, duplicate time-in, time-out without active time-in, repeated requests, and unavailable dependent service.
4. Verify authorization at the server/API level, not only by hiding interface buttons.
5. Verify that important protected actions create appropriate audit events without logging passwords, OTPs, raw biometric data, or secrets.
6. Retest every corrected failure and preserve both the original failure and retest evidence.
7. Measure performance with a defined start/end event and repeated trials under recorded conditions. Keep browser rendering time, API response time, and fingerprint processing time distinct when possible.
8. Exercise repeated operations and recovery cases for reliability. Record failures, retries, data consistency, and recovery behavior.
9. Compute pass rate only for executed test cases; report blocked cases separately.

**Exit check:** Tables 5–6 are complete, all failures are disclosed, and claims match the recorded test environment.

## Phase 5 — Run Standardized Post-Use Evaluation

**Goal:** obtain valid user perceptions after actual system use.

1. Schedule participants and confirm voluntary consent without coercion from supervisors.
2. Give each participant only the role and test data appropriate to the evaluation.
3. Read the same neutral orientation script to every participant.
4. Ask participants to perform the same role-appropriate tasks in the same order. Do not coach unless assistance is requested; record assistance as an observation.
5. Suggested employee tasks: authenticate; review profile; view attendance; submit a test leave request; review leave status; view payroll history; and perform fingerprint time-in/time-out if approved.
6. Suggested administrator tasks: authenticate; manage a test employee; review attendance; process a test leave request; perform a permitted payroll workflow; view dashboards/reports; and review an audit event.
7. Record task completion, errors, requests for help, time on task if approved, and observed difficulty.
8. Immediately after the tasks, administer the 25-item WorkPulse questionnaire confidentially.
9. If SUS is approved, administer the separate ten-item SUS immediately after system use without rewriting or mixing the items.
10. Check forms for completeness without pressuring participants to answer skipped questions.

**Exit check:** Tables 7–15 have anonymized source data, and respondent counts reconcile across consent, task, and questionnaire records.

## Phase 6 — Score the Likert Questionnaire and SUS

**Goal:** calculate reproducible results.

1. Create one spreadsheet row per participant and one column per item. Retain the original 1–5 answers.
2. Use data validation to allow only 1, 2, 3, 4, 5, or blank.
3. For each Likert item, count response frequencies and verify that 5 + 4 + 3 + 2 + 1 counts equal the valid N.
4. Compute item mean with `=(5*n5+4*n4+3*n3+2*n2+1*n1)/valid_N`.
5. Compute category and overall results using one documented rule. Check calculations independently by a second team member.
6. Preserve decimal precision in calculations; round displayed values consistently, normally to two decimal places.
7. For SUS, reverse-score only the even items using 5 − response; score odd items using response − 1; sum and multiply by 2.5 for each participant.
8. Compute mean, standard deviation, median, minimum, and maximum from participant SUS scores.
9. Manually verify at least three SUS records, including a low, middle, and high score.
10. Never convert the Likert overall mean to SUS by multiplying by 20. They are different instruments and scoring models.

**Exit check:** another researcher can reproduce every reported value from the anonymized workbook.

## Phase 7 — Conduct Controlled Fingerprint Evaluation

**Goal:** answer Research Questions 5 and 6 using real biometric evidence.

1. Do not begin until scanner integration, consent, retention/deletion rules, fallback procedure, and adviser-approved trial counts are ready.
2. Freeze the scanner, firmware/driver, SDK, preprocessing, matching mode, and threshold. Do not tune them on final test attempts.
3. Enroll participants using the approved fingers and record enrollment failures separately.
4. Keep enrollment samples separate from final evaluation attempts.
5. Conduct the predeclared number of genuine attempts per enrolled participant using their own enrolled finger.
6. Conduct controlled impostor attempts using a consenting participant's own non-enrolled finger or identity according to the approved one-to-many protocol. Nobody should copy or physically present another person's fingerprint.
7. For every physical attempt, record participant code, ground truth, finger condition if relevant, capture success/failure, predicted result, matched identity if any, matcher score, threshold, processing time, retry number, and notes.
8. Classify valid comparisons into TP, FN, FP, and TN. Failed captures are not valid comparisons and belong in FCR.
9. Calculate FAR, FRR, FCR, accuracy, and timing statistics with their numerators and denominators shown.
10. Investigate every FP and repeated FN. Document usability issues such as finger placement, dry/wet fingers, feedback clarity, delay, and assistance.
11. Delete or retain evaluation biometric data exactly according to the approved policy and document completion.

**Exit check:** Tables 16–18 reconcile: physical attempts = failed captures + valid comparisons.

## Phase 8 — Write, Verify, and Finalize Chapter 3

**Goal:** turn evidence into a defensible discussion.

1. Replace every bracketed placeholder in this file. Search for `[` carefully, accounting for legitimate Markdown links and citations.
2. Number tables and figures in first-mention order. Apply the school's caption format.
3. For each table: introduce it, show it, interpret the main pattern, explain its relevance, and state a limitation where needed.
4. Discuss why results occurred using interview/observation evidence and the related literature from the approved review chapter. Add citations only to verified sources.
5. Ensure every Chapter 1 research question is answered in the synthesis table.
6. Reconcile all counts and denominators across tables. Check that percentages, means, rankings, pass rates, and biometric metrics can be independently recomputed.
7. Ensure screenshots use the evaluated build and contain no personal, payroll, authentication, or biometric secrets.
8. Replace exaggerated claims: use “participants perceived,” “under the tested conditions,” and “the defined test cases passed” where accurate.
9. State honestly when evidence was not collected: for example, “Fingerprint performance was not evaluated because the operational scanner and approved protocol were not available during the study period.”
10. Remove this completion guide, working notes, placeholders, unused sections, and instructional blockquotes from the submission copy.
11. Ask the adviser and one technically knowledgeable reviewer to check the final chapter against Chapters 1 and 2.

## Final Evidence Checklist

- [ ] Adviser-confirmed chapter title and order
- [ ] Organization/research approval and consent records
- [ ] Instrument validation forms and final instrument versions
- [ ] Pilot results and genuine reliability calculation, if performed
- [ ] Respondent invitation, consent, completion, exclusion, and response-rate log
- [ ] Anonymized needs-assessment data and calculations
- [ ] Interview and observation summaries
- [ ] Requirements traceability matrix
- [ ] Sanitized screenshots from the evaluated build
- [ ] Functional and security test cases with evidence
- [ ] Performance and reliability measurements with environment details
- [ ] Post-use task and observation sheets
- [ ] Anonymized 25-item questionnaire dataset and calculation workbook
- [ ] Separate SUS dataset and scoring sheet, only if administered
- [ ] Scanner configuration and biometric trial log, only if tested
- [ ] FAR, FRR, FCR, accuracy, and processing-time calculations with denominators
- [ ] Open-ended response themes and coding notes
- [ ] Documented defects, limitations, and corrective actions
- [ ] Final cross-check against all six research questions

