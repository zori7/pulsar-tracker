# DESIGN.md — visual & interaction brief (Pulsar Tracker)

Designer owns final visual decisions. This brief sets the direction, tokens and motion
rules so the app feels like one product. Read `SPEC.md` §6 for IA and required controls.

## Direction

"Night-sky instrument": a calm, dark, high-contrast personal dashboard. Pulsar = a
pulsing star — motion should feel like *pulses and orbits*, never bouncy-toy. The loop
pattern editor is the hero control; give it the most craft. Avoid generic dashboard
card soup and gradient overload: one accent family, generous type scale, quiet surfaces.

## Tokens (Tailwind v4 CSS custom properties, `@theme` + `:root` overrides)

Prefer CSS variables over `dark:` utility prefixes. Define light + dark by overriding
variables; the app ships **dark-first** (phone at night), light theme optional but wired.

```
--bg            deep space navy/near-black   (e.g. #0B1020 dark, #F7F8FC light)
--surface       slightly raised panels
--surface-2     inputs, chips
--text          high-contrast foreground
--text-muted    secondary
--accent        pulsar violet (primary actions, active fills)
--accent-2      cyan/teal (streaks, highlights)
--danger        destructive
--ring          focus ring
--radius-*      squircles: 10/14/20px
```

Typography: one family (e.g. Inter / Geist / system-ui stack), tight tracking for
numbers (streaks, dates), tabular figures where available. Scale: 12/14/16/20/28/40.

## Layout

- Mobile-first at 390px. Fixed bottom tab bar (Today / Calendar / Items / Settings) with
  active-pill indicator; content padded for safe-area + tab bar height.
- Desktop (≥768px): centered column max-w-3xl, tab bar becomes a top/side rail, list rows
  widen but never stretch full-bleed.
- Tap targets ≥ 44px. Primary actions in the lower half (thumb zone). FAB for quick add
  on Today.

## Motion (framer-motion)

- Springs over eases for interactive state (press, toggle, tab pill). `tween` for
  page/panel transitions. Durations: micro 120–180ms, panels 200–280ms.
- Check-off: a "pulse" — the check draws/scales in, the row briefly glows with `--accent-2`
  then settles; haptic-like scale dip (0.97) on press.
- Loop squares: fill state animates with a soft glow; drag-painting leaves a short trail
  of state changes. Layout animation when loop length changes (squares grow/shrink in).
- Sheets/modals: slide-up with spring + scrim fade. Segmented schedule switch: animated
  pill via `layoutId`, panels crossfade with a small y-shift.
- Lists: staggered fade-in capped at ~6 items.
- **Always** honor `prefers-reduced-motion` (use `useReducedMotion()`: drop glows, keep
  opacity-only transitions).

## Components

Squircle surfaces, 1px borders (`--surface-2`), no heavy shadows. Inputs: filled fields
with `--ring` focus. Buttons: solid accent for primary, ghost for secondary, danger as
text only. Icons: `lucide-react`, stroke 1.75, 20–24px.

The loop/weekday/monthday "square" language must be visually consistent across all
schedule controls (same corner radius, same fill/glow).

## Copy

English, sentence case, warm and terse. Habit-tracking words: "due", "streak", "skip",
"loop". No exclamation marks in UI chrome. Empty states: one line + one action
(e.g. "Nothing due today — enjoy the quiet." / "Add your first habit").
