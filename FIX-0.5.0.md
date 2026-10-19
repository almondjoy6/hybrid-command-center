Milestone 1 dashboard fix:
- Built-in profiles now have genuinely distinct initial layouts.
- Drag source is tracked synchronously to prevent stale React state during drop.
- Up/down controls provide reliable ordering when HTML drag and drop is blocked.
- Width control toggles between one and two columns when the window is wide enough (more than 900px).
- Existing saved profiles are preserved. For existing installations, click Reset profile in Overview to apply the distinct preset to a previously saved profile. Existing saved layouts are never overwritten automatically.
