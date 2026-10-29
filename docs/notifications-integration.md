# Replay notifications integration — 0.1.0

Replay changes only. Pinned browser island and transport are vendored from the shared library; server producer is never a browser asset. Service origin is fixed to https://leewaypb-library.leeohsunshine.chatgpt.site.

## Activation handoff to the shared-library worker

1. Confirm `/v1/*` is reachable server-to-server for approved Replay accounts without a Sites owner gate or a bypass credential. Keep the service demo protected. Verify the service's Replay access adapter can read Replay's existing authenticated `/api/replay/view/:id` and `/discussion` routes.
2. Securely provision the same dedicated `REPLAY_PRODUCER_SECRET` in both server runtime environments; use a random secret of at least 32 bytes. Do not paste it into chat, source, browser assets or URLs. Replay worker owns Replay runtime changes; library worker owns the service runtime.
3. After both routes and the shared key are verified, set Replay `REPLAY_NOTIFICATIONS_ENABLED=enabled` and publish its current saved source with that runtime revision. No email/push activation.
4. Test with Coach Lee and the intended approved player, plus a denied account. This integration has not been activated or verified with live customer accounts.

## Implemented behavior

- Authenticated same-origin proxy: `/api/notifications/inbox`, `/preferences`, `/notifications/:id/read`, `/notifications/:id/open`. GET status returns only activation availability. PUT requires Origin and x-leeway-session: 1. Only current server-verified bearer is forwarded; refreshed HttpOnly cookies return to the browser. Fixed service origin, no redirects, bounded request bytes and timeout. No browser-owned recipient/producer credentials.
- Header island stays outside review/player lifecycle. It is mounted only when the server reports activation ready, resets before session changes, aborts on teardown, and preserves composed replies. Read state is authoritative in the shared service.
- Release event history is embedded in the same conditional review commit. Question/reply events are embedded in the same conditional discussion commit. Drafts and non-question/non-reply discussion notes create no events. Payloads contain IDs/times and committed recipient selectors, never feedback/title/draft text. Existing legacy viewer IDs are not treated as Supabase UUIDs; use recipient email or a `supabase_<verified subject>` access ID.
- Delivery acknowledgement is separate under `replay/notification-delivery/`; stable events are re-signed on retry, exponential jittered backoff applies, and permanent failures remain for owner attention. Posts/releases remain successful during delivery outages.
- Reconciliation is opportunistic on authenticated coach API requests using waitUntil, one R2 listing page per minute with a persisted cursor. No recurring paid scheduler was created. Without coach traffic, retry delivery is delayed.
- Owner manual reconciliation: POST `/api/notifications/reconcile?cursor=<returned cursor>` with same-origin session confirmation. Response identifies retry/blocked/needs-attention event IDs and nextCursor; continue pagination until null. This is also available before activation for diagnosing pending events. No unrelated user can operate it.
- Links use `/replay/view/:id?release=<releasedAt>&at=<seconds>&entry=<UUID>&thread=<UUID>`. Replay independently rechecks release access, bounds timestamps, verifies visible thread membership, and rejects stale release targets. Current-review links reuse player/focus/discussion; another review uses normal guarded navigation.

## Verification and limits

Automated Replay tests cover atomic outbox records, draft privacy, immutable history across later releases, persisted retry/duplicate acknowledgement, session-token rotation/proxy isolation/CSRF, and exact thread navigation without reloading the player or clearing replies. Shared-library tests cover read persistence, recipient checks, stale release/hidden entry/revocation/outage rejection, account teardown and island isolation.

The owner has confirmed Replay notifications verified in live use. This worker’s independent physical-device QA is not claimed. Existing playback regression tests cover YouTube/local playback and independent feedback updates. Uploaded/local video storage behavior is unchanged; no cloud upload or paid service was enabled.


## Replay notification UX (2026-10-09)

Replay mounts its own presentation adapter `app/web/replay-notification-island.js`, based on the 0.1.0 island. The pinned shared assets and other applications are unchanged. Protocol v1 and existing transport remain compatible; producer credentials, email/push flags, authentication and audience are unchanged.

Inbox labels are enriched from current authorized released-review and discussion GETs, at most four reviews concurrently; no draft text or metadata cache survives an account change. If enrichment is unavailable, the service's safe generic title remains. Notifications at 0:00 display their timestamp.

Opening reveals the exact thread with a gold contextual marker, without seeking, pausing or clearing reply text. Coach workspace notifications stay in the editing experience. Selecting a timestamp explicitly starts playback. Successful same-app navigation completes before the shared read write; invalid/stale/revoked or cancelled opens remain unread. Notification reads and per-account review seen baselines remain separate.

Another review uses guarded same-app loading before read acknowledgement. Stale release links fail with a latest-breakdown instruction. Read-write failures surface in the inbox without claiming success.

Library worker handoff (proposal only): consider upstream optional item descriptions, read-after-successful-host-navigation, 0:00 timestamps, separate read/seen explanatory copy, and safe-area mobile panel styling. Replay's adapter owns these behaviors until the library worker publishes a compatible release; do not replace the pinned library files silently.
