# Advanced Feature Direction

This project is moving from a basic expense splitter toward a graph-aware group finance platform.

## Implemented in this branch

1. Advanced circular debt engine
   - Exact minimum-transaction optimization for small groups.
   - Greedy fallback for larger groups.
   - Circular debt cycle detection with cancellable amount metadata.
   - Optimizer stats returned to the frontend.

2. Payment reminders and notifications
   - Creditors can remind debtors from the settlement screen.
   - Payers can remind payees through the backend share-reminder API.
   - Reminders are saved as in-app notifications.
   - Email reminders are sent through the existing email service when configured.

3. Settlement explainability UI
   - Shows raw transaction count vs optimized transaction count.
   - Highlights eliminated payments and detected circular debt cycles.
   - Keeps the direct expense and settlement breakdown already present in the app.

## Next high-value features

1. Receipt intelligence
   - Upload a receipt image.
   - Extract items, tax, discount, and total.
   - Assign individual items to group members.
   - Create expenses automatically after review.

2. UPI-first settlement flow
   - Generate UPI payment links and QR codes.
   - Attach proof URL or payment reference.
   - Confirm, reject, or dispute a marked payment.

3. Spending analytics
   - Monthly group spending trend.
   - Per-person category summaries.
   - Unusual expense alerts.
   - Forecast upcoming recurring expenses.

4. Trust and accountability layer
   - On-time payment rate.
   - Average settlement delay.
   - Pending reminder count.
   - Group reliability insights.

5. Production hardening
   - Membership-gate all group/event/settlement reads.
   - Rate-limit reminders.
   - Add notification pagination.
   - Add audit logs for payment disputes and reminder abuse.
