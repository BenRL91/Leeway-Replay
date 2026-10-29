# Player and notes workspace

The library's main surface is the player, a timestamp strip and the currently selected note. Follow playhead defaults on; it selects the latest timestamp at or before the current time, including all notes at the same timestamp. Seeking backward recalculates it. Turning it off freezes the selection; timestamp buttons and Previous/Next remain usable. The preference is device-local. Playback ticks update only the note view, never the media element or editor.

Personal notes save independently of tutorials. Saved video notes groups them by source kind and ID without duplicating records or migrating the library. Tutorials remain independent collections of snapshot steps, and their steps can drive the playback note view. Backups retain the existing format. Local videos remain local and must be reselected after reopening the app; their saved notes do not require reuploading or a tutorial.

## Review discussion

Released reviews have a separate timestamped discussion for Question, Note and Reply. The coach and currently granted player can post. Each entry receives its author ID, role, display label, timestamp and creation date on the server. Client author fields are ignored. Coach labels use Coach Lee; player labels use the display name configured on the released review. These labels do not establish access.

- `GET/POST /api/replay/view/<reviewId>/discussion` requires current released-review permission.
- `GET/POST /api/replay/reviews/<reviewId>/discussion` requires coach ownership. Coach history can be read after revocation; posting still requires a released review.
- POST fields are `at`, `category`, `body`, `source` (source kind and ID).
- Draft notes/content remain inaccessible to players. Discussion posts never release draft edits or modify review content revisions.
- Revocation blocks player reads and writes. A grant change does not give a new viewer old player questions or old coach replies.
- Entries are scoped to the video source, preventing old-game timestamps being mixed into replacement footage. Posting from a stale source is rejected.
- R2 entries live separately under `replay/discussions/<reviewId>/`. This reuses existing persistence; no new services or media uploads are enabled. Each current-source discussion is limited to 300 entries.
- The editor and player refresh discussions every 15 seconds. Posting is append-only in this first version. Replies are timestamped entries, not nested threads. General library/tutorial sharing remains private.

The app is private; benlee.eelned@gmail.com was explicitly admitted as a Site viewer for testing. Players also need a released per-review access-ID or verified email grant before they can view content or use discussion. No customer emails are sent. This does not connect Coaching orders, payments, or scheduling.

Verification: automated tests cover video notes without tutorials, source groups after reload, tutorial playback, forward/backward scrubbing, same-timestamp notes, follow-off persistence and manual seeking, stable media elements, author spoof rejection, unauthorized/draft/revoked access, persistence, grant changes and source changes. Physical iPhone/iPad testing remains to be performed; this Worker project has no supported managed browser preview.

## Unexpected YouTube pauses

An unexpected paused play button reported on 2026-10-07 is not yet reproduced on physical hardware. Automated note-boundary tests do not prove this problem resolved. The library now updates note data only after library/tab/source changes, rather than sorting and serializing the library four times per second. Both player implementations preserve the existing YouTube instance when the same source is reopened. Failed loads can be retried.

Playback troubleshooting distinguishes actual paused, buffering, browser-blocked and error events. Copy playback report exports the last 80 events with playback position, document visibility, focused element type, browser and viewport. It is device-local and does not collect titles, notes, account data, tokens or source URLs. It logs source loads, reuse and requested seeks; state changes never automatically resume an intentional pause. A report from the affected browser is needed to identify the remaining cause.
