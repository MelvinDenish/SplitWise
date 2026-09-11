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

4. Graph-based debt visualization
   - Shows raw direct debts, optimized debts, detected cycles, and settlement history replay.
   - Uses an SVG graph with members as nodes and debtor-to-creditor arrows.

5. Receipt intelligence
   - Upload a receipt image for reference.
   - Extract items, tax, tip, and total from receipt/OCR text.
   - Assign individual items to group members.
   - Apply item assignments directly into a custom split.

6. UPI-first settlement flow
   - Generate UPI payment links and QR codes.
   - Attach proof URL or payment reference.
   - Auto-read likely UPI/UTR transaction references from proof text.
   - Confirm or dispute a marked payment.
   - Store disputes as audit-trail records.

7. Predictive expense assistant
   - Monthly group spend average and next-month forecast.
   - Category summaries from expense descriptions.
   - Unusual expense alerts.
   - Recurring-expense suggestions.

8. Trust and accountability layer
   - On-time payment rate.
   - Pending debt and pending confirmation counts.
   - Average settlement delay.
   - Reliability badges.

9. Production hardening
   - Membership-gate group and settlement reads.
   - Restrict group listing to the authenticated user.

## Next high-value features

1. Production OCR integration
   - Replace pasted receipt text with direct OCR from uploaded images.
   - Store receipt image files in durable object storage.

2. Deeper audit workflow
   - Add dispute resolution states.
   - Notify both parties when a dispute is opened or resolved.
   - Rate-limit reminders.
   - Add notification pagination.
   - Add audit logs for payment disputes and reminder abuse.
