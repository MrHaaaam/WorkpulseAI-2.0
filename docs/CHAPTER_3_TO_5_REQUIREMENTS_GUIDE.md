# WorkPulse Research Paper: Guide for Chapters 3 to 5

## Important Chapter-Numbering Check

The present file `CHAPTER_2_METHODOLOGY_REVISED.md` labels Methodology as Chapter 2. However, the common five-chapter research format—and the existing `PAPER_REVISION_GUIDE.md`—uses this order:

1. Chapter 1 — Introduction
2. Chapter 2 — Review of Related Literature and Systems
3. Chapter 3 — Methodology
4. Chapter 4 — Results and Discussion
5. Chapter 5 — Summary, Conclusions, and Recommendations

Confirm the required format with the adviser. If the school follows the format above, rename the current Methodology chapter as Chapter 3 and prepare a separate Chapter 2 for related literature and systems. Do not simply duplicate the current Methodology text.

This guide assumes the standard five-chapter format. An alternative arrangement is provided at the end if the school officially places Methodology in Chapter 2.

# Chapter 3

# METHODOLOGY

Chapter 3 explains how the researchers will design, develop, gather data for, test, and evaluate WorkPulse. Write planned activities in the future tense before they happen and completed activities in the past tense after they happen.

## 3.1 Research and Development Design

State that the study uses developmental research to design, build, and evaluate a web-based workforce information system. Explain why this design is appropriate. Identify Scrum or the actual software-development method used by the team; do not claim activities that were not documented.

## 3.2 Locale of the Study

Describe MVL and its location sufficiently for the research context without exposing confidential organizational information. Explain why MVL was selected.

## 3.3 Population, Respondents, and Sampling

Identify the actual MVL population and respondent groups, such as the manager, regular employees, and student or part-time employees. State the sampling method.

If only 10–20 people participate in the initial survey, describe them as initial needs-assessment participants. Do not claim that this is the final evaluation sample unless the adviser approves it. The current draft identifies 30 eligible MVL respondents and proposes total enumeration, so any different final count must be explained using actual inclusion, exclusion, consent, absence, or non-response information.

Include:

- inclusion and exclusion criteria;
- target population and actual number invited;
- number who consented and completed each activity;
- sampling method and justification; and
- respondent distribution by role, reported without identifying individuals.

## 3.4 Data-Gathering Instruments

Describe each instrument separately:

- initial needs-assessment questionnaire, administered before prototype use;
- biometric preference questionnaire or biometric section;
- workforce analytics and AI-preference section;
- manager interview guide;
- observation checklist for existing attendance, leave, employee-record, and payroll processes;
- functional and security test-case sheets;
- post-use system evaluation questionnaire; and
- biometric trial recording sheet, if a real scanner is integrated.

The initial survey measures current practices, problems, needs, concerns, and preferences. It does not measure the usability or quality of a system respondents have not used.

## 3.5 Instrument Validation and Pilot Testing

Explain how qualified experts will review the questions for relevance, clarity, neutrality, and alignment with the research objectives. Revise the instrument based on their comments. If a Likert-scale evaluation instrument will be used, conduct a pilot test with people outside the final respondent group and calculate reliability only from real pilot data. Do not invent a validity score or Cronbach’s alpha.

## 3.6 Data-Gathering Procedure

Present the procedure in chronological order:

1. obtain permission from MVL and research approval where required;
2. explain the study and obtain informed consent;
3. administer the initial needs assessment to approximately 10–20 available MVL personnel or the adviser-approved number;
4. interview the authorized manager and observe current workflows;
5. summarize requirements and use them to refine the proposed system;
6. design and develop WorkPulse through documented iterations;
7. conduct technical, functional, security, and performance testing;
8. allow eligible respondents to perform standardized system tasks;
9. administer the post-use evaluation questionnaire; and
10. conduct separately approved fingerprint trials only after the device, consent process, and test protocol are ready.

## 3.7 System Requirements and Design

Document the requirements supported by actual needs-assessment evidence. Include:

- functional requirements;
- non-functional requirements;
- use-case diagram;
- system architecture;
- database or entity-relationship design;
- data-flow diagrams, if required;
- user-role and permission matrix;
- interface designs or wireframes; and
- fingerprint attendance workflow, clearly marked proposed until implemented.

## 3.8 Development Tools and Technologies

Identify the actual technologies used, their roles, and relevant versions: React, TypeScript, Node.js, Express, MongoDB Atlas, email authentication services, and the selected fingerprint hardware/SDK where applicable. Avoid presenting a planned face scanner as implemented merely because respondents preferred it.

## 3.9 Testing and Evaluation Procedure

Define how the study will test:

- functional suitability through traceable test cases;
- usability through task completion and a validated post-use instrument;
- performance efficiency through measured response or processing times;
- reliability through repeated operations and documented failures;
- security through authentication, authorization, ownership, session, validation, rate-limit, and audit checks; and
- fingerprint performance through genuine attempts, controlled impostor attempts, failed captures, FAR, FRR, and processing time, only if fingerprint integration is operational.

## 3.10 Statistical Treatment

For initial multiple-choice data, use frequency and percentage:

\[
Percentage=\frac{Frequency}{Number\ of\ valid\ respondents}\times100
\]

For a properly validated Likert-scale post-use evaluation, use frequency, percentage, and weighted mean. Clearly state the scale and verbal interpretation before analyzing the results. Open-ended responses may be grouped into recurring themes. With a small 10–20-person initial sample, emphasize descriptive findings and avoid broad generalization or unsupported significance tests.

## 3.11 Ethical, Privacy, and Data-Protection Measures

Cover voluntary participation, informed consent, anonymity or confidentiality, secure storage, limited access, retention, deletion, and the participant’s right to withdraw. A preference survey is not consent to collect biometric data. Fingerprint or face information must not be collected during this initial questionnaire.

Before actual biometric enrollment, provide a separate notice and consent process explaining what is collected, why it is needed, who may access it, how it is secured, how long it is retained, how it is deleted, and what alternative attendance method is available.

# Chapter 4

# RESULTS AND DISCUSSION

Chapter 4 reports actual evidence. Do not write final numbers until data collection and testing are complete. Organize the chapter according to the Statement of the Problem and objectives in Chapter 1.

## 4.1 Respondent Profile

Present only relevant, non-identifying characteristics such as respondent role and length of service. Show the number invited, number who responded, valid responses, and response rate.

## 4.2 Initial Needs-Assessment Results

Use frequency-and-percentage tables or charts for:

- current attendance method;
- common attendance, leave, payroll, and record-management problems;
- desired employee-portal functions;
- willingness to explore attendance-verification options;
- fingerprint, face, both, or non-biometric preference;
- preference for descriptive analytics, explainable fixed methods, trained AI, both, or no predictive analytics;
- desired analytics features, explanation requirements, human-review expectations, and AI-related concerns;
- privacy, security, accessibility, hygiene, and reliability concerns; and
- preferred backup method.

After each table, interpret what the results mean for system requirements. Do not merely repeat every number. For example: “Most respondents selected attendance-history access; therefore, personal attendance history was prioritized as a requirement.” Only write such a statement when supported by the real results.

## 4.3 Interview and Observation Findings

Group recurring findings into themes. Explain how evidence from the manager, employees, and observed workflows confirms or differs from the survey findings.

## 4.4 Developed System

Present the working modules with labeled screenshots and concise explanations. Link each implemented feature to a requirement or objective. Clearly distinguish implemented, partially implemented, proposed, and unavailable functionality.

## 4.5 Functional and Security Test Results

Use a traceability table containing requirement or test ID, scenario, expected result, actual result, status, and evidence. Discuss failures and corrective action honestly.

## 4.6 Performance and Reliability Results

Report the test environment, number of trials, measured response times, successful operations, failures, recovery behavior, and limitations. Avoid claims such as “fast” or “reliable” without measurements.

## 4.7 Post-Use User Evaluation

This section is different from the initial survey. Respondents must first use the working system through standardized tasks. Report the frequency, percentage, weighted mean, and interpretation for the adviser-approved quality criteria. Discuss open-ended feedback and observed usability difficulties.

## 4.8 Biometric Results, If Implemented

Report the scanner model, SDK, matching mode and threshold, number of enrolled participants, genuine attempts, controlled impostor attempts, failed captures, FAR, FRR, capture failure rate, and processing times. If hardware testing is not completed, state that biometric performance was not evaluated; do not convert preference responses into proof of biometric accuracy.

## 4.9 Discussion and Study Limitations

Compare the findings with relevant literature and explain why results occurred. State limitations such as small sample size, single organization, short test period, network dependency, device availability, and limited generalizability.

## Defending the Choice Not to Use a Custom-Trained AI Model

Do not defend the decision by saying that the researchers simply dislike trained AI. Defend it as a scope, evidence, risk, and validation decision.

WorkPulse currently uses transparent analytical methods rather than a custom-trained machine-learning model:

- Holt–Winters additive forecasting for short-term attendance estimates;
- the Bradford Factor with time decay as a rule-based attendance signal;
- Modified Z-score with median absolute deviation for unusual-arrival detection; and
- rolling calculations for biometric operational health.

These methods may be appropriate for the present project because:

1. **The available dataset is limited.** A reliable trained model requires enough representative historical records. A 10–20-person initial needs survey is preference data and cannot train or validate an employee-level predictive model.
2. **The outputs must be explainable.** Administrators and affected employees should be able to understand why a forecast or alert appeared and inspect the underlying records.
3. **A trained model requires a valid target.** The researchers must precisely define what the model predicts. “Employee productivity” cannot be used unless actual, fair, and relevant work-output measures exist.
4. **Validation would expand the study.** A trained model requires separated training, validation, and test data; comparison with a baseline; appropriate performance metrics; error and bias analysis; privacy review; drift monitoring; and a retraining plan.
5. **Workforce decisions are high impact.** Attendance or anomaly outputs may affect employees. Transparent decision-support with human review is safer than unsupported automated decisions.
6. **A more complex model is not automatically better.** It should be adopted only if testing shows a meaningful improvement over simpler baselines for the defined task.

A defensible manuscript statement is:

> WorkPulse uses explainable statistical and rule-based workforce analytics rather than a custom-trained machine-learning model. This design was selected because the available organizational dataset is limited, the analytical outputs require transparent interpretation, and the study does not possess sufficient evidence to train and validate a fair and generalizable employee-level model. The outputs serve only as decision-support information for authorized human review. A trained model may be examined in future work after sufficient representative data, a valid prediction target, privacy safeguards, baseline comparisons, bias testing, and an approved monitoring and retraining procedure are established.

The questionnaire results can support a discussion of stakeholder preferences and concerns, but they cannot by themselves prove that the selected analytical method is accurate or appropriate. Technical suitability must be shown through actual test data and comparison with an appropriate baseline.

# Chapter 5

# SUMMARY, CONCLUSIONS, AND RECOMMENDATIONS

## 5.1 Summary of the Study

Briefly restate the problem, objectives, development approach, respondents, instruments, system produced, testing performed, and major findings. Do not introduce new data.

## 5.2 Summary of Findings

Answer each research question in the same order used in Chapter 1. Use concise statements supported by Chapter 4 tables, tests, or themes.

## 5.3 Conclusions

Draw one or more conclusions directly from each objective and verified result. A conclusion should say what the evidence establishes, not what the researchers hoped would happen.

Do not conclude that:

- the system is acceptable before respondents test it;
- fingerprint or face recognition is accurate from preference data;
- the system eliminates all errors or security risks;
- the system improves productivity without measuring productivity; or
- findings from 10–20 initial respondents represent all organizations.

## 5.4 Recommendations

Make recommendations for MVL, system administrators, developers, and future researchers. Base them on actual limitations and findings. Possible recommendations include:

- refine high-priority modules identified by respondents;
- provide a documented correction and fallback attendance process;
- complete fingerprint integration and controlled biometric evaluation;
- evaluate face scanning separately if preference evidence and project scope justify it;
- strengthen deployment security, backup, monitoring, and privacy procedures;
- conduct longer-term evaluation with a larger population; and
- validate forecasting or anomaly-detection methods before operational use.

## Evidence to Prepare Before Writing Chapters 4 and 5

- signed approvals and informed-consent records, stored separately from answers;
- blank and completed data-gathering instruments;
- actual respondent counts and response rate;
- encoded survey results and calculation sheet;
- interview or observation summaries;
- requirements traceability matrix;
- labeled system screenshots;
- functional, security, performance, and reliability test logs;
- post-use evaluation results;
- biometric test logs, if applicable; and
- documented limitations and unresolved defects.

## Alternative If Methodology Must Remain Chapter 2

If the adviser confirms that Methodology is officially Chapter 2, do not copy it into Chapter 3. Use the school’s exact template. A reasonable alternative is:

- Chapter 3 — System Analysis, Design, and Development: requirements, diagrams, architecture, database, interfaces, development iterations, and implemented modules;
- Chapter 4 — Results and Discussion: initial findings, system tests, user evaluation, biometric results, and limitations; and
- Chapter 5 — Summary, Conclusions, and Recommendations.

The adviser-approved institutional format takes priority over this suggested arrangement.
