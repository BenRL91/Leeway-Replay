# Leeway Replay companion direction

Confirmed direction: companion apps for iPhone, iPad, and Android, alongside browser extensions. Private notes/tutorials are the foundation; publishing tutorials is a potential Pro feature and recipients should ideally view free.

Current preview: embedded YouTube player, timestamped notes, private tutorials, backup import/export, shared-message URL parsing, preservation of supplied timestamps, manual notes for unavailable embeds. URL entry point: ?video=<encoded YouTube URL>. Receiving a URL prefills the workspace; playback begins only after choosing Load video.

Next milestones:
1. Validate playback, capture, reload persistence, tutorial editing, and Files backup export/import on iPad Safari.
2. Improve the complete tutorial-following experience based on that feedback.
3. Package a native companion app with iOS/iPadOS Share extension and Android share-intent reception. Use native shared storage/inbox for handoff and migrate safely from preview backups. Timestamp availability depends on the received link; do not assume access to another app's playback state.
4. Test native embedded-player identity, app lifecycle, durable storage, and share handling on devices before TestFlight/Play testing.
5. Design account ownership and published snapshots, hosted free viewer, update/revoke controls, and server-side entitlements before enabling Pro sharing.

There is no native app or installed share-sheet integration in this preview. No YouTube partnership, acquisition, cloud sync, or subscription is assumed. Browser extensions cannot modify the native YouTube app.
