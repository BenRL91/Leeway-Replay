# Unified Replay flow — October 9, 2026

## Working flow
The homepage and /replay show My Replays and Shared with me for every admitted account. Create Replay defaults to personal; Coach Lee can also select Coaching breakdown. Ownership belongs to the record, not a global student/coach viewing mode.

The same owner workspace handles footage, notes, start/end times, pause-on-open, looping, frame stepping, optional plans, draft persistence, private sharing, preview and revocation. Share is visible beside Save draft. Personal sharing requires a title, source and a nonempty note. Coaching retains its player/summary/priority/drill checklist.

Sharing supports up to 20 explicitly selected verified-email recipients (or legacy account-ID grants). Existing site admission still applies. Participants view the released snapshot, post questions/replies, and manage their own discussion entries. Only the record owner edits draft content, publishes, changes grants, moderates the conversation or deletes the Replay. Coach Lee cannot edit another owner's personal Replay.

All edits remain private until explicitly released again. No public publication is implied by sharing.

## Existing data
No destructive migration. Records without kind remain coaching breakdowns. /library preserves all old notes, tutorials and supported nonvideo files. Open as Replay copies the matching video's notes into a new personal draft with timestamps, end times and pause choices. Tutorial video steps can likewise be copied per video; multi-video tutorial sequencing remains in the saved library.

The owner editor can import matching library notes; it saves the copied notes immediately and skips existing body/start matches. Legacy direct ?video links still open the saved library player.

## Local footage
Records store only a stable local file reference and notes. Each recipient must choose their own matching video/audio file. File matching reuses the existing on-device sampled fingerprint. No bytes are uploaded; the server media endpoint rejects local sources. Cloud uploads remain disabled.

## Notifications and communication
Discussion events target the actual record owner. The current v1 event names and wire authorRole values remain unchanged for compatibility; authorization uses record ownership, never those labels. Replay presents the actual owner label. Email/push remain disabled; no new consent is collected.

## Boundaries
Coaching orders, payment status, package eligibility and scheduling remain owned by Leeway Coaching. This change does not implement the proposed order-to-Replay bridge. Personal and coaching work now share a flow, not an order integration.

Full co-editing of the owner's draft is not enabled. Invited participants collaborate through questions/replies. Existing approval/admission and shared authentication settings are unchanged.

## Verification
Automated coverage includes ordinary-owner creation/share/revoke, coach isolation from others' drafts, private draft snapshots, persistence, multi-recipient grants, local reference sharing and matching, owner notification targeting, copied legacy notes, paused notes and existing playback controls. Physical mobile/browser visual QA is unavailable in this environment.
