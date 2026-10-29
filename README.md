# Leeway Replay

**Private video review with timestamped feedback and focused discussion.**

Replay turns footage into a review workspace: capture a moment, explain what matters, loop the relevant segment and discuss it with selected participants. Personal reviews and coaching breakdowns share a workspace while keeping record ownership and access explicit.

[Review workflow](docs/unified-replay-flow.md) · [Playback](docs/playback-notes.md) · [Notifications](docs/notifications-integration.md) · [Communication policy](docs/communications-policy.md)

## Product capabilities

- Timestamped notes with start/end times, looping and frame stepping.
- Private draft editing followed by explicit release to selected recipients.
- Questions and threaded replies around review content.
- Separate owner and participant permissions, plus sharing revocation.
- Local footage references that keep video bytes on the user's device.
- A retained notes library and browser-extension source from the original YouTutor project.

## Engineering highlights

| Concern | Design |
| --- | --- |
| Draft privacy | Participants view the released snapshot; subsequent edits stay private |
| Access control | Site admission and per-review grants are separate checks |
| Ownership | Authorization follows the review owner, not a global coach/student mode |
| Local media | Stable file references and sampled matching; recipients choose their matching file |
| Notifications | Shared notification components with app-specific authorization and event production |
| Regression coverage | Tests for playback, sharing, auth, local files, drafts and workspace behavior |

## Development

```sh
npm ci
npm test
npm run build
```

The application uses JavaScript browser modules and a Worker backend. The build uses esbuild and emits `dist/server/index.js`. Connected authentication requires deployment-specific configuration; see [authentication notes](docs/leewaypb-auth.md).

| Path | Contents |
| --- | --- |
| [app/web/](app/web/) | Review workspace, playback and browser integration |
| [app/server/](app/server/) | Authentication, reviews, uploads and notifications |
| [app/tests/](app/tests/) | Automated regression tests |
| [extension/](extension/) | Browser-extension source |
| [docs/](docs/) | Product flows, contracts and implementation notes |

## Hosted application and source provenance

[Open Leeway Replay](https://replay.leewaypb.com) — access is controlled; this is not an anonymous public demo.

The October 29, 2026 import preserved 87 deployed-source files from Sites release **62**, source commit `cf66aee05ef5d9bc6cc011773e16023499cb4dc1`. This README is repository documentation added after that snapshot. Production remains hosted on ChatGPT Sites; GitHub changes do not automatically deploy it.

Runtime secrets and customer records are managed separately. Local footage stays on-device, cloud uploads remain disabled in the documented unified flow, and email/push delivery remain disabled. Automated tests do not establish physical mobile/browser visual QA.

Originally developed as [YouTutor](https://github.com/BenRL91/yoututor); the original repository is retained separately.

## Related projects

| Project | Responsibility |
| --- | --- |
| [PaddleLog](https://github.com/BenRL91/PaddleLog) | Equipment, maintenance and usage history |
| [Pickle Point](https://github.com/BenRL91/Pickle-Point) | Scoring, games and sessions |
| [Leeway Coaching](https://github.com/BenRL91/Leeway-Coaching) | Booking and breakdown fulfillment |
| [Leeway Replay](https://github.com/BenRL91/Leeway-Replay) | Private video reviews and discussion |
| [Leeway Common](https://github.com/BenRL91/Leeway-Common) | Shared notification components and service |

Each repository has its own release lifecycle. Shared identity does not grant access to another app's private data.
