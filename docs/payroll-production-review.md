# Payroll production review

The reset button, confirmation dialog, and PATCH `/api/payroll-requests/:id/reset` route have been removed. An old client cannot invoke the reset operation against the updated backend. Deploy both frontend and backend to retire it fully.

Existing `calculationResetAt` behavior and historical audit descriptions remain supported. Removing them would change calculations for previously reset records. No production payroll documents were deleted or modified during this review.

## Improvements included

- Payroll list queries select the fields returned to the browser rather than reading entire documents, including internal history.
- Startup creates a payroll ID index for payment/detail lookups and a compound creation-time/ID index for the sorted history query. Both are nonunique, avoiding a new uniqueness requirement on legacy records.
- Payroll rows use a map built once for the selected period instead of searching the entire payroll list for every employee. The first/newest record continues to win when duplicates exist.

## Remaining scale limits

- GET `/api/payroll-requests` returns at most the newest 2,000 records. This bounds payload size but can omit older payroll and allowance history. The table pagination is client-side. A separate server-paginated history API and period-scoped payroll query are needed for complete history at larger scale.
- Opening payroll prepares the current period for every active employee. The backend uses eight workers, but total calculation work still grows with employee count. Concurrent administrators can initiate overlapping refreshes.
- Overview reads at most 10,000 attendance records and 2,000 payroll/leave records. These caps can affect dashboard completeness at larger scale.
- The frontend build still reports JavaScript chunks over 500 kB. Splitting large views/export dependencies could reduce initial download and parse time.

## Validation and deployment boundary

The production build and 62 targeted backend tests passed, including reset-route removal, projected payroll reads, legacy period fallback, calculations, carried balances, allowance duplication prevention, payment safeguards, and transactional rollback. Backend syntax checks passed.

Tests use isolated mocked database objects. This review did not connect to the deployed database, inspect its actual index inventory, measure production latency, or perform a live load test. Indexes take effect when the updated backend starts successfully. Actual performance should be assessed using deployed request timings and MongoDB execution plans against representative data.
