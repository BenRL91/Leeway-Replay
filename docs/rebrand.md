# Leeway Replay rebrand

Leeway Replay is the product brand throughout the general library, tutorials, uploads, coaching workspace, account screens, and desktop extension. Tagline: Watch. Understand. Improve. Coaching service: Game Breakdown by Coach Lee.

The existing host and callback URL remain unchanged to preserve sign-in and saved links. Existing storage keys, message namespaces, auth cookies, review IDs, and Firefox extension ID deliberately retain their legacy technical names. No data migration or audience change is needed. New backups use `leeway-replay-backup`; imports accept both that and `yoututor-backup`.

Build the desktop packages with `node extension/build.cjs`. Shared core/editor/styles are copied from `app`, with Chromium and Firefox packages written into ignored `extension/dist`. Existing installed extension data is retained when updated under the same extension identity; installing a separate unpacked identity does not transfer its data automatically. Existing extension and web libraries remain separate.
