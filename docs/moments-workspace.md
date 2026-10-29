# Unified Moments workspace

Replay owner and viewer screens share one reading model: video, selected moment,
and its conversation. No server schema or access changes are involved.

- Moment navigation includes follow-video and loop controls. All moments combines
  notes and top-level questions; replies remain attached to their original root.
  Filter by text, author, or question/note. Selection uses the existing seek path.
- The selected root controls which conversation is shown. Reply composition keeps
  its original context even if playback moves on. Notification targets are inspected
  without seeking and turn off follow-video for the current screen.
- Add moment is one entry point. Owners choose a private draft note or a shared
  question/note. This distinction is intentional: release remains explicit, while
  discussion uses existing server-enforced participant access. No implied release.
- Existing editors are moved, not recreated. Failed saves retain their content.
- Playback settings and review details are disclosure panels outside moment browsing.
  Owners keep source, plan, release/revoke, and deletion. Viewers get plan and help.
- Large screens use a video/moments split; smaller screens stack the same components.
  No new sticky overlays or horizontal scrolling are introduced.

The old /library tutorial interface remains available, with its existing storage and
components. It is not migrated or deleted. Personal and coaching Replay review screens
use this workspace. Local media is still device-only. Email and push remain disabled.

Automated checks cover grouping, filtered selection at shared timestamps, stable media,
retained drafts, consolidation, existing ACLs/revocation, notifications, and seeking.
Physical mobile/desktop browser visual QA was unavailable in this session.
