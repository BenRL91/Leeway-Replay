# Leeway Replay → Leeway Coaching: proposed delivery contract v1

Status: proposed; Leeway Coaching has not implemented this boundary. Work in this change was confined to Leeway Replay. No customer delivery emails, payment changes, or shared Supabase configuration changes were made. Replay admission changed to an app-private beta as explicitly requested.

## Product ownership

Leeway Replay owns review content, release snapshots, authorized viewing, private uploaded media, and review revocation. The general-purpose library and coaching workspace both carry the Leeway Replay brand. Leeway Coaching owns the order, payment status, package eligibility, deadlines, and follow-up-call scheduling.

Branding: Leeway Replay; Watch. Understand. Improve.; Game Breakdown by Coach Lee. Delivery message: Your Leeway Replay is ready. Customer CTA: Open your breakdown.

## Identifiers and canonical URL

The Leeway Replay coach create endpoint returns `review.id`, a UUID. Once released, the coach response includes `viewerUrl` with exactly this shape:

`https://yoututor-preview.leeohsunshine.chatgpt.site/replay/view/<reviewId>`

This is a record locator, not an access credential. Never put player names, emails, order identifiers, access tokens, service-role keys, invitation secrets, or source credentials in the path, query string or fragment.

The coach UI is `/replay`; the owner-only saved draft preview is `/replay/preview/<reviewId>`. A draft-preview URL must never be accepted for customer delivery.

## Authentication and admission

Replay verifies LeewayPB/Supabase users server-side with getUser and uses Secure/HttpOnly host-only cookies. The private beta now uses an app-owned verified-email allowlist, independent of ChatGPT sign-in. The approved owner email maps to the original coach/storage identity; the approved test account remains a student with its existing Supabase-derived storage identity. Unverified emails, client metadata, unapproved accounts, and anonymous API callers cannot enter. Every protected page and API checks admission on the server; removing an approval rejects existing sessions on their next request. Supabase accounts used in other apps are not changed or deleted.

Platform admission is public only to remove the ChatGPT gate and expose the sign-in page. App data stays private: entering requires app approval, and opening a player review also requires a released per-review grant. A review can grant one exact app access ID or one server-verified recipient email. Revoking that grant immediately rejects review, media, and discussion requests. Signing in alone cannot expose another student's review.

The custom hostname `replay.leewaypb.com` is registered but awaiting DNS validation. Once active, viewer links created there use `https://replay.leewaypb.com/replay/view/<reviewId>`. The generated hostname remains supported. Add `https://replay.leewaypb.com/auth/return` to shared Supabase Redirect URLs before testing sign-in on the new host; do not remove other apps' URLs or change the global Site URL.

## State, release and revocation

- Draft: owner-only editing/preview; viewer API and media return generic 404, including for the owner on the released-view route. No delivery URL is offered.
- Released: complete content is copied to a published snapshot, with one intended viewer grant. The authorized viewer and coach owner may read it. Other users and anonymous callers cannot. Later draft edits and proposed viewer changes stay private until another release. Save-and-release is one conditional storage write, protected against stale edits.
- Revoked: released-view content and uploaded-video GET/HEAD/range requests return generic 404; the coach keeps the editable draft and can release again deliberately. New accesses are blocked immediately. An open viewer rechecks access every 15 seconds and when returning to the tab. Already downloaded content cannot be recalled. A subsequent release can reactivate the same canonical URL for the newly specified viewer.

Each media request checks the review grant and uses only the uploaded source selected for that released snapshot. It cannot list or retrieve the coach's other files. The shared source URL contains no account credential. Third-party YouTube footage keeps its own YouTube visibility rules; Leeway Replay cannot revoke access to the original YouTube video.

## Order association in Coaching

Store an authenticated, server-side association on the existing breakdown order, e.g.:

```
{
  "deliveryType": "leeway-replay",
  "replayReviewId": "<UUID>",
  "replayViewerUrl": "https://yoututor-preview.leeohsunshine.chatgpt.site/replay/view/<UUID>",
  "replayDeliveryState": "released"
}
```

These are proposed Coaching fields, not a deployed schema or API. The order already owns the customer identity. Keep that mapping in Coaching's database; do not send customer/order data through the review link. For v1 the coach can copy the ID/URL from Leeway Replay into an authorized Coaching admin form. Current Leeway Replay endpoints use the verified LeewayPB app cookie session behind the private Site audience gate, with same-origin mutation protection, not a Coaching service credential. There is no deployed cross-app release/status synchronization, webhook, service API, or cross-app session bridge. Do not call them with a service-role key or assume cross-origin cookies authorize them.

## Exact changes required in Leeway Coaching

1. Add a typed delivery choice alongside the existing YouTube URL: `youtube` or `leeway-replay`. Preserve the existing YouTube validator and legacy records. Never loosen it to accept arbitrary URLs.
2. For Replay, accept only HTTPS at the exact host `yoututor-preview.leeohsunshine.chatgpt.site`, with pathname `/replay/view/<UUID>`, and no username, password, port override, query string or fragment. Match the stored review ID to the URL's UUID. Reject `/replay/preview`, `/replay`, lookalike hosts, draft links and arbitrary redirects. Do not fetch user-entered URLs to validate them.
3. Save the proposed association only through Coaching's existing authorized admin/order-edit path. Keep payment/package/deadline checks there. The URL alone is not proof of release or authorization. Until a narrowly authorized cross-app status boundary is separately implemented, require coach verification of release and intended-viewer admission; track revocation manually. Do not claim automated status verification.
4. Change the relevant admin delivery field, delivery renderer, customer order/review view, message template and button to handle the typed Replay delivery. Use “Your Leeway Replay is ready.” and “Open your breakdown”. Preserve existing YouTube deliveries.
5. Never send draft or revoked deliveries. If revoked later, suppress future Coaching delivery/reminder actions and show “Breakdown unavailable” until deliberately released again. This requires explicit manual reconciliation in v1; no webhook currently exists.
6. Keep follow-up-call links, eligibility and scheduling in Coaching. Display its existing scheduling CTA separately only when the package includes it. Do not create scheduling endpoints in Leeway Replay.
7. Before emailing an external customer, verify BOTH audience admission and their per-review verified recipient email or exact access-ID grant, plus access denial for another admitted user and revocation. Do not send emails while implementing/testing. Existing audience or shared-auth changes require separate scope and authorization.

## Verification in Leeway Replay

Automated tests cover draft isolation, owner-only preview/editing, unauthorized access, released-snapshot isolation, conditional-write conflict protection, granted-viewer access, per-request uploaded-video authorization, revocation, persistence across a fresh Worker request, preserved general library records, and simulated native/YouTube timestamp seeking and range scrubbing. The stable player stays mounted during seeking; mobile CSS uses an internal scroll region with overscroll guards and 48px touch controls.

There is no compatible supervised browser preview for this Worker build in the available environment. Physical iPhone/iPad Safari playback, scrubbing, cross-site sign-in and an external customer journey remain unverified. Upload limit remains 50 MB, browser codecs apply, and no video transcoding was introduced.

## Timestamp conversation threads (2026-10-07)

Released coaching notes expose “Reply to coaching note”; standalone player questions expose “Reply”. Replies inherit the root timestamp and retain a server-created snapshot of the original feedback/question. The coach reads and replies under Feedback → Notes & questions; the player uses Questions. Existing standalone discussion entries remain roots without migration. Replies do not change draft/release revision or command playback.

POST discussion accepts optional `replyTo: {kind: "coaching" | "discussion", id}`. The server resolves only released coaching notes or discussion entries visible to that caller, validates current review/source/audience access, and stamps `thread`, `parentId`, timestamp, and author. New recipients cannot inherit earlier recipients’ threads; revocation blocks both reads and writes. Conversation retains the existing 300-entry limit and 15-second refresh interval. This introduces no Coaching integration changes.

## Video-first workspace (2026-10-07)

Coach and player screens now show the video above a compact timestamp strip and current feedback. The full note list and coach composer expand beneath it. Coach footage/settings, practice plans, preview and sharing remain mounted in a native modal side drawer opened with Review tools. Players open Practice plan in their drawer. Closing via Close/Escape preserves unsaved content and does not recreate or command the video. Native dialog provides modal focus containment.

Questions explicitly directs users to ask about timestamps without existing feedback; Reply on coaching feedback starts a contextual thread. Thread replies use “Reply in this thread” rather than the new-question wording. Access, persistence, delivery and release rules are unchanged.

## Coach review deletion (2026-10-07)

Coach dashboard cards and Review tools → Share expose Delete review with explicit permanent-deletion confirmation. POST `/api/replay/reviews/<id>/delete` requires the owning coach, same-origin CSRF enforcement and the current `expectedRevision`. It conditionally replaces content with an ID/owner/revision/deleted marker, then deletes all discussion objects across footage and audiences. The marker prevents stale writes from recreating deleted content. Deleted reviews return 404 from editor/preview/view/media/discussion and are omitted from both dashboards. Cleanup failures remain inaccessible and permit an idempotent owner retry. Original videos, general library notes and tutorials are preserved. This does not delete or modify a Coaching order.

## Precision playback and note context (2026-10-08)

YouTube embeds explicitly retain native controls, fullscreen and keyboard support. Both review and library playback have Previous frame / Next frame controls and selectable 24/25/30/50/60/120 fps (device-local preference). These pause then time-seek by 1/fps, without autoplay or player replacement. YouTube's iframe API exposes timed seeking, not a frame index: exact frame accuracy is not guaranteed, and the UI says so. Native file seeking also depends on the decoder.

Coaching notes and library/tutorial records support optional `endAt`, validated strictly after `at`. Millisecond timestamps round-trip through draft/release, library backups and tutorial snapshots. Composer actions capture/clear the end; selected coaching feedback offers Set end here, saving the complete draft immediately. Release is still required to publish later edits. Following stops displaying feedback at its explicit end without falling back to older notes or issuing any playback command. Notes without an end retain existing behavior. No cloud video uploads were enabled.

## Selected section looping (2026-10-08)

Follow-playhead surfaces have an independent Loop selected section toggle, off by default with a device-local preference. Clicking a ranged timestamp arms only that selected range; crossing other notes during ordinary playback does not arm loops. At the range end during playing/ended playback, the existing player seeks to its start and continues. Pending rewind detection avoids repeated commands while the YouTube seek settles. Selected feedback stays visible within its loop even if other notes fall inside that interval. Point notes clear the armed range; disabling looping, explicit Replay seeks outside the range, replacing footage or removing/changing the range cancels it. Pause/frame-step does not force autoplay. YouTube native seeks lack a dedicated iframe event; larger position discontinuities are also used to detect leaving a section. End timing is polled and may overshoot slightly; exact frame boundaries are not guaranteed.
