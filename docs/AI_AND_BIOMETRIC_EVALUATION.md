# AI and Biometric Evaluation

## Current truth

The AI Insights screen now executes four deterministic analytical methods against the live MongoDB records: additive Holt-Winters attendance forecasting, Bradford plus time decay, Modified Z-score arrival anomaly detection, and rolling FingerJet scanner health. The endpoint returns the model version, input volume, status, raw supporting values, and a human-review warning. Fingerprint enrollment and kiosk verification use protected fingerprint templates and record real matcher scores.

These implementations are operational analytics, not independently validated predictive or disciplinary systems. Bradford scoring is a policy formula rather than machine learning, and scanner health is an operational matching margin rather than identity probability or certified biometric accuracy.

WorkPulse must not claim measured accuracy, F1, MSE, FAR, or FRR until the evaluation protocols below are completed. No metric should be invented.

## Metrics implemented for future evaluation

`backend/src/ai-metrics.js` provides deterministic metric calculations once labeled results are available:

- Binary classification: TP, TN, FP, FN, accuracy, precision, recall, F1, False Acceptance Rate, and False Rejection Rate.
- Numerical forecasting: MAE, MSE, and RMSE.

## Confusion matrix

For biometric verification, each test attempt requires a known ground-truth identity decision and the system's predicted accept/reject decision.

| | Predicted accept | Predicted reject |
|---|---:|---:|
| Genuine employee | True Positive | False Negative |
| Impostor/stranger | False Positive | True Negative |

- **False Acceptance Rate:** `FP / (FP + TN)`. This is the key unauthorized-access error.
- **False Rejection Rate:** `FN / (FN + TP)`. This measures legitimate employees blocked.
- **Precision:** `TP / (TP + FP)`.
- **Recall:** `TP / (TP + FN)`.
- **F1:** harmonic mean of precision and recall.
- **Accuracy:** `(TP + TN) / all attempts`; report it with FAR and FRR because an imbalanced test set can make accuracy misleading.

## Required test protocol

1. Freeze a biometric algorithm, device firmware, match threshold, and preprocessing version.
2. Obtain informed consent and a documented retention/deletion policy.
3. Use separate enrollment and evaluation attempts.
4. Include genuine and impostor attempts across employees, fingers, devices, environmental conditions, and relevant demographic groups.
5. Prevent the same samples from appearing in both tuning and final evaluation.
6. Report the confusion matrix, FAR, FRR, precision, recall, F1, confidence intervals, sample size, device/version, and threshold.
7. Compare thresholds using ROC/DET analysis and select one based on security and usability requirements.
8. Monitor post-deployment drift without retaining unnecessary raw biometric images.

## Forecast metrics

Attendance forecasting should use chronological train/validation/test splits. Report MAE for understandable average error and RMSE/MSE to emphasize large misses. Compare Holt-Winters against a simple seasonal-naive baseline. A complex model is not justified unless it consistently beats that baseline on unseen periods.

## Anomaly and risk logic

- A Modified Z-score threshold around absolute 3.5 is a conventional starting point, not a universal truth. Validate it on labeled WorkPulse events.
- Bradford scores encode an HR policy rule and should not be called machine learning.
- Risk scores must exclude approved leave and allow human review and correction.
- No score should automatically discipline or deny payment to an employee.

## Explainability requirement

Every generated result should store and display model/rule version, input window, important inputs, formula or rule used, threshold, raw score, resulting category, recommended action, and a human-review disclaimer. This converts general UI explanations into per-decision traceability.
