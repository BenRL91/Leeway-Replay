# Leeway Replay — Video Frame

Selected direction 02: video frame with a play triangle, seven-hole pickleball, and scrub timeline. Palette adapted from the supplied Leeway Pickleball logo: charcoal #141414, red #B5121B, gold #E7B52B, white #FFFFFF. Gold text uses the darker #956B12 for legibility on white. Error and release indicators retain meaningful status colors.

One SVG source is reused across header/editor branding and extension builds. Favicon shares the same geometry. No full Leeway crest is embedded in the app. Notes, source selection, local playback, access controls and disabled cloud-upload behavior are unchanged.

## Coaching palette alignment

Shared palette now uses the supplied exact role colors in `app/palette.css`. Light and dark appearances follow the device color preference without new layout controls. Primary red #B51F2D / hover #961923, shared gold #D2B779, light gold text/focus #8C5C16. Video-frame geometry stays unchanged; its colors align with the shared palette. Success, warning, and error use separate semantic tokens and light/dark surfaces. Coaching-only brighter golds are not the shared default.

Appearance control: System / Light / Dark in the library, coaching and account headers. Preference persists only on this device under `leeway-replay.appearance.v1`; System follows live OS changes and changes sync across open tabs. The head script sets the resolved theme before first paint. No account, authentication or server data writes are involved.
