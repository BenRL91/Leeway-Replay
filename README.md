# Leeway Replay

Private video reviews, timestamped notes, questions, and threaded replies. Originally YouTutor.

## Released source snapshot

Mirrors the live application at https://replay.leewaypb.com.

- Sites release: **62**
- Deployed source commit: `cf66aee05ef5d9bc6cc011773e16023499cb4dc1`
- Synced: 2026-10-29

All 87 deployed-source files are preserved byte-for-byte, including application and extension source, tests, documentation, build configuration, and tracked deployment output. This README adds repository orientation.

## Development

Run `npm ci`, `npm test`, and `npm run build` with Node.js. Web assets are in `app/web`, backend in `app/server`, extension in `extension`, and integration notes in `docs`. The build emits `dist/server/index.js` for the existing Sites Worker deployment.

Production remains hosted on ChatGPT Sites. GitHub does not automatically deploy this app. Runtime secrets and customer records are managed separately and are not included. Local footage stays on the user's device. Beta admission and review sharing remain separate. Email and push remain disabled.

The original YouTutor repository is https://github.com/BenRL91/yoututor and is unchanged by this import.
