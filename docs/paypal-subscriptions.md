# PayPal Subscriptions Setup

Wazap has PayPal subscription support ready but disabled by default. Keep Dodo as
the public checkout provider until the PayPal account review is cleared.

## PayPal dashboard

Create one monthly subscription plan for each Wazap tier:

- Basic: USD 19 monthly
- Pro: USD 49 monthly
- Ultimate: USD 99 monthly

Webhook URL:

```text
https://wazap.lt/api/payment/paypal/webhook
```

Subscribe the webhook to subscription lifecycle and payment success/failure
events, including:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.RE-ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`
- `PAYMENT.CAPTURE.COMPLETED`

## Environment variables

Add these only after PayPal is ready:

```text
PAYPAL_ENVIRONMENT=live
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_PLAN_ID_BASIC=
PAYPAL_PLAN_ID_PRO=
PAYPAL_PLAN_ID_ULTIMATE=
NEXT_PUBLIC_WAZAP_CHECKOUT_PROVIDER=paypal
```

Then rebuild and restart Wazap:

```bash
cd /opt/wazap
npm run build
pm2 restart wazap --update-env
```

## What the integration does

- Signed-in users can start a PayPal subscription checkout from `/pricing`.
- Wazap stores the pending PayPal subscription ID.
- Verified PayPal webhooks activate or renew the user's plan.
- Cancelled, suspended, expired, or failed subscriptions downgrade the user to
  the free plan.
- A paid receipt email is sent when email is configured through Resend.

## Safety checks

Before switching the public provider to PayPal:

```bash
curl --http1.1 -A 'Mozilla/5.0' -X POST https://wazap.lt/api/payment/paypal/create \
  -H 'Content-Type: application/json' --data '{"plan":"ultimate"}'
```

Logged-out requests should return `401`.

Unsigned webhook requests should return `400`:

```bash
curl --http1.1 -A 'Mozilla/5.0' -X POST https://wazap.lt/api/payment/paypal/webhook \
  -H 'Content-Type: application/json' \
  --data '{"event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{}}'
```
