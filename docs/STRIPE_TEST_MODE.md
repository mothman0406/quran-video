# Stripe test-mode checklist

Configure these server/deployment variables with Stripe test-mode values; never commit their values:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_CREATOR_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`
- `NEXT_PUBLIC_APP_URL`

Manual smoke test:

1. Sign in, choose Creator checkout, and complete Stripe test checkout with a Stripe test card.
2. Confirm the webhook is received and the account plan changes to Creator.
3. Confirm 1080p and no watermark are active.
4. Open Manage subscription and confirm the Customer Portal opens.
5. Cancel at period end; confirm paid access remains during the active period.
6. Confirm the ending webhook changes the account to Free without deleting projects or styles.
