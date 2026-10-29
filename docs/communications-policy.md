# LeewayPB communication policy — Replay implementation and suite handoff
Policy version: 2026-10-09. Owner instruction applies across LeewayPB; this checkout changes Replay only.

## Owner policy
Everything email is opt-in only. Booking, payment, submission, account creation, contact email entry, and app admission never imply consent. No transactional-email exemption is assumed.

Every email must include a visually prominent direct unsubscribe. No survey, explanation, forced sign-in, or retention flow. Email, push, in-app preferences, and read state are separate choices. No repeated prompts to pressure people into opting in.

## Replay now
- Settings → Communication: /settings/communication (authenticated, existing approved-account access).
- Public policy: /communication-policy (contains no account or review data).
- Account screen and Replay's notification preferences link to both.
- Email and push are inactive; no functional-looking consent controls are displayed for either.
- The saved v1 inApp preference controls only the unread bell badge. The inbox remains available.
- The Replay proxy permits only inApp and version for preference writes, rejecting email/push consent fields.
- Existing in-app delivery remains enabled. Coaching's inactive-channel status does not disable Replay.
- No mailer, consent opt-in endpoint, unsubscribe endpoint, or provider configuration was enabled. Shared notification assets remain pinned and unchanged.

## Activation prerequisites — shared-library worker
Version the preference/event extension before any activation; v1 inApp preferences do not represent email permission. Ship the mailer, explicit consent, suppression, and unsubscribe mechanisms together.

Require a separate initially unselected choice per app and purpose, durable consent timestamp and policy version, verified intended recipient, and send-time consent checks. Suppression wins over queued sends, retries, and recipient changes. Do not automatically resubscribe.

Provide an idempotent opaque-token-authenticated POST for one-click unsubscribe. Tokens must carry only unsubscribe authority, never account, booking, review, or payment access. Link landing pages must offer one direct unsubscribe action; GET must not mutate consent because of link scanners. Confirm success immediately. Emails must include prominent direct unsubscribe and supported one-click headers.

Distinguish saved preference from channel activation in Settings → Communication; disabled controls must not appear functional. Mirror a short public policy link. Keep push choice separate from email.

## Other owning workers
Coaching keeps confirmations in-app, calendar events without customer attendees, and sendUpdates=none for creation/change/cleanup. PaddleLog and Pickle Point should place settings and policy links consistently. Replay does not edit or certify those apps.

Provider-controlled sign-in/payment messages require separate owning-worker audits before customer beta. Replay's auth configuration and payments were not changed. No customer emails were sent.
