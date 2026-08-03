# MyCleaner RCS messaging

## Included

- Transactional notification outbox with idempotency.
- Google RCS for Business delivery.
- SMS fallback through Twilio only after a definite RCS 404/unsupported result.
- Exponential retry for temporary failures.
- Delivery/read receipt webhook.
- Danish templates for booking confirmation, travelling, arrived, started, completed, cancelled, rescheduled and review request.

## Required secrets

Set these as Supabase Edge Function secrets:

- `GOOGLE_RBM_SERVICE_ACCOUNT_JSON`
- `GOOGLE_RBM_AGENT_ID`
- `GOOGLE_RBM_REGION` (default `europe-west1`)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RCS_DISPATCH_SECRET`
- `RCS_WEBHOOK_SECRET`

## External activation

Code alone cannot activate production RCS. Create and brand the MyCleaner agent in Google's RCS for Business Developer Console, complete brand verification, test the agent and obtain launch approval for each target carrier/country.

## Deploy

1. Apply `20260727170000_rcs_notification_outbox.sql`.
2. Deploy `rcs-dispatch` and `rcs-webhook`.
3. Configure the Google RBM webhook URL to the deployed `rcs-webhook` endpoint.
4. Schedule `rcs-dispatch` every minute using the existing scheduler/cron mechanism, passing `x-dispatch-secret`.

## Enqueue from booking status transitions

Call the RPC from trusted server-side code only:

```ts
await admin.rpc('enqueue_transactional_notification_v1', {
  _idempotency_key: `booking:${booking.id}:provider_travelling:${booking.travelling_at}`,
  _recipient_phone_e164: customer.phone_e164,
  _event_type: 'provider_travelling',
  _payload: {
    customer_name: customer.first_name,
    provider_name: provider.display_name,
    eta_minutes: 18,
    booking_url: `${APP_URL}/bookings/${booking.id}`,
  },
  _booking_id: booking.id,
  _recipient_user_id: customer.id,
  _locale: customer.locale || 'da-DK',
  _preferred_channel: 'rcs',
});
```

Use one stable idempotency key per booking status event. Never enqueue directly from the browser.

## Recommended event mapping

- Accepted/confirmed → `booking_confirmed`
- Travelling → `provider_travelling`
- Arrived → `provider_arrived`
- Work started → `work_started`
- Completed → `work_completed`
- Cancelled → `booking_cancelled`
- Rescheduled → `booking_rescheduled`
- After customer confirmation → `review_requested`

## Important safety rule

Do not send SMS merely because an RCS request times out. The RCS message may still be delivered. Retry with the same RCS message ID and use delivery receipts. Immediate SMS fallback is reserved for a definite unsupported response.
