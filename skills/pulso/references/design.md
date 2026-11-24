# Visual system

Pulso is meant to be glanced at: from across the room, or in the middle of an incident.
Every design decision serves that.

## What holds the page together (don't change it)

1. **The verdict comes first.** One plain-language sentence, huge (up to 4 rem, weight
   800). It answers "is everything working?" before anyone reads a card.
2. **One status colour dominates.** The 8 px top strip, the core ring, the favicon and
   the tab title all change together with the verdict. The status shows even when the
   tab is in the background.
3. **Colour never works alone.** Every status also has a shape and a word: `off` uses a
   hollow dot and a dashed border; `error`, a dashed red wire and a side bar; every pill
   names the status.
4. **Motion means something.** Sparks only travel along wires of live components: fast
   and many when `working`, slow when `attention`, none when `off` or `error`. The core
   beats slowly. Nothing else moves unless the user acts. With
   `prefers-reduced-motion`, everything stays still.
5. **Detail is one click away, never on the main view.** Cards say a single sentence.
   Description, history, trends, facts and links live in the modal. Exception: the
   infrastructure map explains the architecture, so its cards carry the description (two
   lines at most) and up to four facts. History, trend and links stay in the modal.
6. **Neutral surfaces.** Cool glacier background, near-white cards, a single shadow (the
   modal's). That way the status colour is the only thing that stands out.

## What adapts to each project

All variables are at the top of the `<style>` block:

| Variable | Used for | Advice |
|---|---|---|
| `--font` | The whole page | The brand font, if it has a sans with an 800 weight for the verdict. If it is a serif, use it on `h1` only. |
| `--glacier`, `--paper`, `--ink`, `--muted`, `--rule` | Surfaces and text | Cool or warm neutrals to match the brand. Keep `--muted` on `--glacier` at AA contrast. |
| `--disc`, `--disc-ink` | The core | Ink colour by default. Can be the brand's primary colour if it is dark. |
| `--active`, `--attention`, `--off`, `--error` | Statuses | Adjust the hue, not the meaning: green, amber, grey, red. |
| `--attention-ink` | Amber text | Pure amber doesn't reach AA contrast as text. |
| `--radius` | Cards | 6–14 px. |

There is an equivalent block for dark mode (`prefers-color-scheme`, plus
`data-theme="dark"` on `<html>` to force it, handy for office screens).

### Fonts

The template downloads no fonts: it uses `Poppins` if the page already loads it, and the
system font otherwise. To use the brand's font, add its `@font-face` (served by the
project itself, with `font-display: swap`) and put it first in `--font`.

### Copy and language

All of the page's own copy lives in the `I18N` object in the script, one dictionary per
language, with plurals. The page picks one from `<html lang>` (`en`, `es`, or a regional
variant such as `es-MX`) and falls back to English. Dates, times and numbers use `Intl`
with the same language. To add a language, copy the `en` dictionary, translate it and
set `lang`. Tab labels and aria labels are filled in from the dictionary too; only the
`noscript` notice is plain HTML.

## Layout

```
┌──────────────────────────────────────────────────────────────┐ ← status strip
│ All systems go                       13 components running.  │
│                                      Checked at…             │
│ Processes •   Infrastructure •   Events 2                    │
│ ─────────────────────────────────────────────────────────────│
│ Left lane             ╭─────╮            Right lane          │
│ [card]────────╮       │core │      ╭────[card]               │
│ [card]────────┼──────▶│     │◀─────┼────[card]               │
│ [card]────────╯       ╰─────╯      ╰────[card]               │
│ ─────────────────────────────────────────────────────────────│
│ • Active • Working • Check ○ Off • Error              Links  │
└──────────────────────────────────────────────────────────────┘
```

- Below 900 px the diagram becomes one column with the core on top and no wires.
- Tabs only appear if more than one has content. Their counter shows the components with
  problems and takes the colour of the worst one.
- Infrastructure: if there are connections (`connects`), the map comes first: one column
  per step of a request, cards centred vertically, curved wires leaving from the side of
  the card and spread out so they never share an anchor. Below 1100 px the columns stack
  and the wires disappear (connections are still listed in the modal). After the map, an
  auto grid of cards 260 px or wider, grouped, for components without connections.
- Map icons live in `ICONS` in the script: 1.7 px stroke on 24×24. Add any you need in
  the same style; an unknown name shows the status dot instead.
- Events: a timeline up to 860 px wide.

## Accessibility

- Tabs use `role="tablist"`, with arrow keys, Home and End.
- Each card is a button (its name stretches over the whole card); sub-components are
  buttons of their own.
- The modal is a native `<dialog>`: it traps focus, closes with Esc, the X or a click
  outside, and returns focus when it closes.
- Status is always announced in text (pills, visually hidden in sub-components) and the
  connection banner uses `role="status"`.

## Extension ideas (only when asked)

- **Wall-screen mode**: with `?screen`, hide the footer and rotate the tabs every 20 s.
- **Sound or notification** when something turns `error` (with the user's explicit permission).
- **Public page** for customers: a separate template, without `facts` or internal detail.
