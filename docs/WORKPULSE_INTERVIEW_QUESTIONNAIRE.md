# WorkPulse: Interview Questionnaire for System Requirements

**Purpose:** Understand the organization's actual employee-record, attendance, leave, and payroll processes; identify problems; and determine which WorkPulse features address those needs.

**Intended respondents:** Owner or manager, attendance/payroll personnel, and employee representatives. Ask questions relevant to each respondent's responsibilities.

**Interviewer:** ____________________  **Date:** ____________________

**Respondent name or code:** ____________________  **Position:** ____________________

**Organization:** ____________________  **Interview duration:** ____________________

## Opening statement

We are developing WorkPulse to support employee records, attendance, leave, and payroll management. We would like to understand your current procedures, difficulties, and priorities. Participation is voluntary. You may skip a question or stop the interview. Please do not share passwords, verification codes, or confidential employee information. With your permission, we will take notes for our academic requirements and system design.

Permission to take notes: ☐ Yes ☐ No

Permission to record, if recording is proposed: ☐ Yes ☐ No ☐ Not applicable

## A. Current operations

1. What are your responsibilities in managing employees, attendance, leave, or payroll?
2. Please walk us through your current process, from recording an employee's attendance to preparing their pay. Who handles each step, and what tools or documents are used?
3. Which parts of this process take the most time or cause the most difficulties? Can you describe a recent example and its effect?
4. What employee classifications and work schedules do you use, and how do these affect attendance, leave, and pay?

## B. Employee records and account access

5. What information do you collect from new employees, where is it stored, and how do you check its accuracy?
6. Who may view or change employee information? Which changes require approval, and how is that approval recorded?
7. How do you confirm an employee's contact details and provide access to workplace information? What happens when the employee has no usable email address or loses access to it?
8. What happens to an employee's records and system access when they leave the organization?

## C. Attendance monitoring

9. How do employees currently record time-in, time-out, and breaks? How do you confirm who made each entry?
10. What attendance errors or disputes occur, if any? How often do they happen, and how are they resolved?
11. What rules determine lateness, absences, completed working hours, and missed time-outs? How are exceptions handled?
12. What should happen when an employee cannot record attendance because of a device, power, or internet problem?
13. After discussing the current process: would fingerprint attendance be suitable for your workplace? What concerns, practical limitations, or alternative methods should be considered?

## D. Payroll preparation

14. What are your payroll cutoffs and payment schedules, and who prepares, checks, and authorizes payroll?
15. How is pay calculated for each employee classification? What records and rules are used for hours, rates, additions, deductions, and other pay components?
16. What payroll errors, delays, or disagreements occur, if any? Can you describe how an issue was discovered and corrected?
17. How do you handle unpaid balances, held payroll, corrections, and payment reversals? What records must be kept for each action?
18. How do employees receive or review their pay breakdown, and how do they raise questions about it?

## E. Leave management

19. How do employees request leave, who decides on it, and how are employees informed of the decision?
20. What leave types, eligibility rules, and allowances apply? How are balances tracked and approved leave reflected in attendance and payroll?

## F. Reports, employee access, and security

21. What attendance, leave, or payroll information do you need to review regularly? Which summaries or reports are difficult to prepare today?
22. What information should employees be able to view or request themselves? Which events require notifications, and through what channels?
23. When a record changes, what details should be retained to explain who changed it, when, and why? Who should be allowed to review that history?
24. What arrangements are needed to protect confidential records, recover account access, and restore data after a problem?

## G. Attendance insights and priorities

25. How do you currently identify recurring attendance problems? What information would help you investigate a pattern, and what should a manager check before drawing a conclusion?
26. If the system flags an unusual attendance pattern, how should it explain the flag, and how should an employee or manager correct an inaccurate interpretation?
27. Which three problems should the proposed system address first? What improvements would show that the system is useful?
28. What devices, internet connections, training, or other limitations might affect using the system? Are there requirements we have not discussed?

## Interviewer follow-up prompts

Use these where relevant; do not suggest an answer:

- Can you give a recent example?
- How often does that happen?
- Who is affected, and what is the consequence?
- Approximately how much time does the task take?
- May we see a blank form or anonymized example, with permission?
- What exceptions should the system accommodate?
- How would you determine whether the proposed improvement works?

## Question-to-feature discussion guide

This table identifies features to evaluate against the answers. It is not evidence that respondents requested or approved them. A proposed feature may need to be changed, deferred, or removed after the interview.

| Questions | Requirement to investigate | Related WorkPulse feature |
|---|---|---|
| 1–4, 27–28 | Responsibilities, workflow, priorities, and practical constraints | Overall scope, settings, and interface design |
| 5–6 | Accurate employee records and controlled changes | Employee directory and administrator controls |
| 7, 24 | Reliable account contact and secure account access | Email verification, login OTP, and password recovery |
| 8 | Access removal while preserving required history | Employee archiving and account deactivation |
| 9–13 | Reliable identity and attendance records | Fingerprint enrollment, attendance kiosk, and attendance monitoring |
| 4, 11 | Applicable attendance schedules and exceptions | Work schedules, grace-period settings, and attendance flags |
| 14–16 | Consistent payroll preparation and review | Attendance-based calculations and bulk payroll preparation |
| 17 | Traceable unpaid balances and payment changes | Carry-over handling and payroll status controls |
| 18 | Employee access to pay details | Payslips and payroll summaries |
| 19–20 | Documented leave decisions and balances | Leave requests, approval/rejection, and balance tracking |
| 21–22 | Timely summaries and access to personal records | Dashboard, notifications, and employee portal |
| 6, 23–24 | Accountability and protection of records | Role-based access, administrator confirmation, and audit logs |
| 25–26 | Explainable attendance patterns for human review | Attendance insights and risk flags |

## Interview findings and feature justification

Complete this table using actual interview notes. Keep a separate row for each finding. Distinguish the respondent's statement from the researchers' proposed solution.

| Question / respondent / date | Actual answer or accurate summary | Identified problem or rule | Proposed requirement or feature | Priority | Respondent validation / follow-up |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

**Illustrative example only — not an actual interview finding:** If payroll personnel report that they manually total attendance hours and frequently need to recalculate them, the proposed response could be attendance-based payroll calculations with administrator review. Record their actual explanation and applicable pay rules before accepting that requirement.

## Closing and validation

Read back the main problems, rules, and priorities to the respondent. Ask: “Does this accurately describe your current process and needs? What should we correct or add?”

Confirmed findings / corrections: ___________________________________________

Follow-up information needed: _____________________________________________

**Academic reporting note:** If WorkPulse features were implemented before this interview, describe this as a requirements-validation interview. Do not claim these answers originally produced the features unless that is supported by the actual development timeline and interview records. Identify other genuine sources of requirements, such as observation, existing forms, documented policies, and technical design decisions.
