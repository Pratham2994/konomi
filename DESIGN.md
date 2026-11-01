---
name: Konomi
description: Your own seasonal anime chart, marked by hand and scored by comparison.
colors:
  ink: "#0d0c12"
  ink-2: "#15131c"
  ink-3: "#1e1b27"
  ink-4: "#2a2635"
  line: "#2f2b3b"
  paper: "#f4f1ea"
  paper-2: "#c9c4d6"
  paper-3: "#8f89a3"
  spring: "#ff7aa2"
  summer: "#ffc23d"
  fall: "#ff7340"
  winter: "#63c7ff"
  good: "#8be3a8"
  bad: "#ff6b6b"
typography:
  display:
    fontFamily: "Dela Gothic One, Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "clamp(36px, 6vw, 72px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Dela Gothic One, Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "clamp(24px, 3vw, 40px)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Dela Gothic One, Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "clamp(22px, 2.4vw, 32px)"
    fontWeight: 400
    lineHeight: 1.1
  numeral:
    fontFamily: "Dela Gothic One, Zen Kaku Gothic New, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
  body:
    fontFamily: "Zen Kaku Gothic New, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  tile-title:
    fontFamily: "Zen Kaku Gothic New, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
  label:
    fontFamily: "Zen Kaku Gothic New, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  band: "4px"
  cover: "6px"
  row: "10px"
  field: "12px"
  panel: "14px"
  sheet: "20px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "72px"
  gutter: "clamp(16px, 3vw, 40px)"
components:
  button:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.ink-4}"
  button-primary:
    backgroundColor: "{colors.spring}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-ghost:
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  field:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "52px"
  quick-add:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 12px 0 16px"
    height: "44px"
  chip:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  chip-on:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  segment-on:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  season-band-head:
    backgroundColor: "{colors.fall}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.band}"
    padding: "8px 16px"
    height: "56px"
  obi:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "2px 8px"
  panel:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "16px 24px"
  toast:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px 12px 12px 18px"
---

# Design System: Konomi

## Overview

**Creative North Star: "The Seasonal Chart, Marked by Hand"**

Konomi is the seasonal anime chart poster fans share every quarter, made personal. Every title is pinned to the season it aired. Each season owns a solid band of its own ink, and the user's covers sit under it in a printed grid. State is drawn on the covers with a pen: a loose circle, a half arc, a strike, a dotted ring. The score rides on a paper obi strip wrapped across the cover foot, like the band on a boxed Blu-ray release.

The ground is near-black ink with warm paper-white text. Cover art supplies all the colour in the content; the chrome supplies only the four season inks, used as whole blocks and as the one live accent of the current context. Density is high on the chart (a poster, not a dashboard) and generous on the single-decision screens (rate, duel). Controls are soft pills; covers keep a tight 6px corner; season headers are near-square slabs.

The system refuses the AniList-style dark dashboard: no sidebar, no stat cards, no neon accent. Numbers appear as large display numerals or on the obi and the score rail, never in boxed metric tiles.

**Key Characteristics:**
- Ink ground (#0d0c12), paper text (#f4f1ea), four season inks that own whole bands.
- Covers are the only imagery; everything else is type, ink, and hand-drawn strokes.
- Title state is a pen mark over the cover, drawn in the season ink.
- The score sits on the obi strip at the cover foot and on one 1-10 rail.
- Dela Gothic One for display, numerals and the 好み mark; Zen Kaku Gothic New for all other text.

## Colors

A dark, slightly violet ink scale carries the chrome; four saturated season inks carry identity, one at a time.

### Primary
- **Season Ink** (the `--season` slot): not one colour but the current context's season. It resolves from the `data-season` attribute to one of the four inks below and drives primary buttons, focus rings, caret, selection, active-nav underline, pen marks, the obi dot, the "you" line on the score rail, section headings on Taste and Profile, and accent numerals.
- **Sakura Spring** (#ff7aa2): spring bands and spring-context accents.
- **Sun Summer** (#ffc23d): summer bands and accents.
- **Persimmon Fall** (#ff7340): fall bands and accents.
- **Ice Winter** (#63c7ff): winter bands and accents.

### Neutral
- **Night Ink** (#0d0c12): the page ground; also the text colour on any season-ink or paper surface.
- **Raised Ink** (#15131c): fields, popovers, panels, the rate sheet, the phone bottom bar.
- **Control Ink** (#1e1b27): default button and chip fill, selected list rows, hover on ghost controls.
- **Hover Ink** (#2a2635): button hover, scrollbar thumb, empty-cover tint fallback.
- **Rule Line** (#2f2b3b): every 1px border and divider.
- **Paper** (#f4f1ea): primary text; also a surface for the obi, toasts, selected chips and segments, the duel "vs" disc, and the avatar.
- **Soft Paper** (#c9c4d6): secondary text (`.muted`), inactive nav, labels.
- **Faint Paper** (#8f89a3): tertiary text (`.faint`), rail lines and ticks, placeholders, kbd hints.

### Status
- **Good** (#8be3a8) and **Bad** (#ff6b6b): only as low-strength tints for import success and error notices and as a removal outline in Settings. Never a status for a title.

### Named Rules
**The One Season Rule.** A screen speaks in one season ink at a time through `--season`. Several inks appear together only where several seasons are shown, each confined to its own band.

**The Cover Is The Colour Rule.** Chrome never adds hue beyond the season ink. Cover art and a title's own cover colour (the `--tint` used for the cover fallback and the title-page header wash) are the only other colour sources.

**The Ink-On-Ink Rule.** Text on a season-ink or paper surface is always Night Ink (#0d0c12), never white.

## Typography

**Display Font:** Dela Gothic One (with Zen Kaku Gothic New, system-ui)
**Body Font:** Zen Kaku Gothic New (with system-ui, -apple-system, Segoe UI), weights 400 / 500 / 700

**Character:** A heavy, poster-weight Japanese display gothic for titles and numbers, paired with a clean humanist kaku gothic that reads small and dense on a chart. Both are loaded from Google Fonts in `index.html`; tabular numerals are on globally.

### Hierarchy
- **Display** (400, clamp(36px, 6vw, 72px), 1): page titles such as "Your chart", the landing hero (up to 96px, -0.02em), the Taste galaxy title, profile names.
- **Headline** (400, clamp(24px, 3vw, 40px), 1.1): section heads on Taste and Profile, usually in the season ink.
- **Title** (400, clamp(22px, 2.4vw, 32px), 1.1): the season name and year inside a band head; 22px in narrow bands.
- **Numeral** (400, 20-80px, 1): scores, guesses, ranks and counts, always in the display face; accent numerals take the season ink.
- **Body** (400, 16px, 1.5): running text; synopsis at 1.65 and max 68ch; leads at 52-64ch.
- **Tile title** (700, 13px, 1.3, clamp to 2 lines): cover captions.
- **Label** (700, 11-14px): nav, chips, segments, meta lines, rail labels. Sentence case, no tracking.

### Named Rules
**The Display Numbers Rule.** Every score, guess, rank or count the user should notice is set in Dela Gothic One. Body text never carries a hero number.

**The No Shouting Labels Rule.** Labels are bold, sentence case, untracked. The built system has no uppercase tracked labels; do not add them.

## Layout

The page is a full-bleed poster up to 2200px wide, with a fluid gutter (clamp(16px, 3vw, 40px)) and a 4px-based spacing scale (4, 8, 12, 16, 24, 32, 48, 72). The top bar is 64px and sticky, with a translucent ink backdrop blur.

The chart packs season bands side by side in a wrapping flex row. One tile size is shared across every band (clamp(132px, 9.8vw, 180px), gap clamp(12px, 1.4vw, 22px)), and each band is exactly as wide as its titles, like a printed seasonal chart. Below 700px every band is full width and the grid auto-fills tiles of clamp(98px, 28vw, 150px).

Breakpoints as built: 380px (brand word hides), 560/640/700px (phone layouts), 900px (bottom bar and sticky phone add field below; top nav and top-bar add field above), 1100px (profile cover fan), 1280px (home right rail and docked rate panel), 1920px and 2200px (wider panels, larger tiles).

Phone: add field sticky under the top bar, content, then a fixed 68px bottom bar of five items with a raised 48px season-ink add disc in the centre. Desktop at 1280px and up: main column plus a sticky right rail of clamp(300px, 24vw, 420px).

## Elevation & Depth

Depth is mostly tonal: the ink scale steps up from ground to raised to control surfaces, separated by 1px Rule Line borders. Shadows are dark, long and soft, and they belong to physical objects (covers, the obi, discs) and to floating layers (popovers, the rate sheet, toasts).

### Shadow Vocabulary
- **Cover lift** (`box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.7), 0 2px 6px -2px rgb(0 0 0 / 0.5)`): every cover, and the duel "vs" disc.
- **Obi** (`box-shadow: 0 2px 6px rgb(0 0 0 / 0.45)`): the paper strip on a cover.
- **Popover** (`box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.9)`): quick-add results and the account menu.
- **Sheet** (`box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.95)`): the floating rate panel.
- **Toast** (`box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.8)`): toasts and the galaxy hover card.
- **Pen** (`filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.6))`): keeps hand marks legible over any art.

### Named Rules
**The Objects Cast Shadows Rule.** Covers and floating layers cast shadows; flat chrome (bands, buttons, chips, fields, rows) never does.

## Shapes

Three corner families. Covers are 5:7 portrait with a tight 6px corner. Controls (buttons, chips, segments, the quick-add field, badges, toast actions) are full pills; avatars, discs and icon buttons are circles. Surfaces use soft rectangles: 10px for list rows, 12px for form fields and rating tiers, 14px for panels, popovers and toasts, 20px for the phone rate sheet. Season band heads are near-square slabs (4px).

Hand marks deliberately break the cover silhouette: the pen SVG overhangs the cover by about 9% horizontally and 7% vertically and is rotated by a per-title wobble of -8 to +8 degrees, so no two marks look stamped. The page clips horizontal overflow so the overhang never causes sideways scroll. The obi also overhangs the cover by 3px on each side.

Season-ink rules of 3px (galaxy stage foot, profile header foot, landing sections and steps) divide large regions; 1px Rule Line borders divide everything else.

## Components

### Buttons
Soft, bold pills.
- **Shape:** full pill (999px), min height 44px, 0 24px padding, weight 700.
- **Default:** Control Ink fill, Rule Line border, Paper text. Hover goes to Hover Ink with a Faint Paper border.
- **Primary:** season-ink fill, Night Ink text, no border; hover brightens by 8%.
- **Ghost:** transparent; hover fills with Control Ink.
- **Press / Disabled:** scale(0.97) on press; 45% opacity when disabled.
- **Focus:** 2px season-ink outline, 3px offset (global).

### Chips and Segments
- **Chip:** 34px pill, Control Ink fill, Rule Line border, 13px bold. Selected flips to Paper fill with Night Ink text.
- **Segmented control:** a Raised Ink pill track with 4px padding; options are 36px pills in Soft Paper; the selected option is Paper with Night Ink text. Wraps into an 18px-radius block below 640px.

### Inputs / Fields
- **Field:** 52px, Raised Ink fill, Rule Line border, 12px corner, 17px text. Focus swaps the border to the season ink; no glow.
- **Quick add:** a 44px pill search field with a leading search icon and a `/` key hint. The home hero version grows to clamp(60px, 7vw, 76px) with a 2px border and 18-24px text. Results open in a Raised Ink popover (14px corner, popover shadow) with cover thumbnails, a selected row in Control Ink, and status alternates as small pills.

### Navigation
- **Top bar:** 好み mark in Dela Gothic One and the season ink, then the quick-add field, then text links in Soft Paper (15px bold, pill hover in Control Ink). The active link turns Paper with a 2px season-ink underline. A season-ink count badge marks pending ratings.
- **Phone:** five-item fixed bottom bar, 11px bold labels in Faint Paper; active turns Paper with a season-ink icon. The centre add is a raised 48px season-ink disc.
- **Icons:** inline SVG only (`Icon.tsx`).

### Cover Tile (signature)
A 5:7 cover with a 6px corner and the cover-lift shadow. If the art fails, the cover shows its first letter in the display face over the title's own tint. A tile is the cover plus a 13px bold title clamped to 2 lines. Hover lifts the art 3px.

### Obi Strip (signature)
A Paper band across the cover at 9% from the foot, 3px wider than the cover on each side. It holds a 7px season-ink dot at the left and the score (one decimal, display face) at the right. Hidden on the xs and s thumbnail sizes.

### Hand Mark (signature)
An SVG pen stroke over the cover in the season ink, 3.2px round-capped: **circled** = completed, **half arc** = watching, **struck** (Paper, 3.6px) = dropped, **dotted ring** = planned. When a title is marked, the stroke draws itself over 0.7s on the ease-out curve (the dotted ring fades in over 0.4s).

### Season Band
A solid season-ink slab (min 56px, 8px 16px padding, 4px corner) with the season and year in the display face in Night Ink, a count, and the season kanji (春 夏 秋 冬) as a 46px watermark at 22% opacity on the right. The kanji hides when the band has an action or is narrow. An action button inside a band is Night Ink with Paper text. The neutral variant (non-season groupings) drops the slab for a Paper title over a 2px Faint Paper rule.

### Score Rail
The one 1-10 rail every score sits on: a 1px Faint Paper line with ticks and 11px numbers. The user's score is a solid 3px season-ink line labelled above; Konomi's guess is a dashed Paper line labelled below.

### Rate Panel and Duel
- **Rate panel:** a Raised Ink sheet (20px corner, sheet shadow). Docked to the right rail at 1280px and up, floating bottom-right at 900px and up, above the bottom bar on phones. Feeling tiers are 48px rows with a 12px corner; the top tier fills with the season ink and the next with a 22% season tint. Hover on a tier shows a season-ink border and a 2px nudge right.
- **Duel:** two covers side by side with a Paper "vs" disc between them; hover lifts a side 3px and rings its cover in a 3px season-ink outline. Number key hints sit on dark discs, hidden on touch.

### Toast
A Paper pill-cornered (14px) bar with Night Ink text and a Night Ink pill action; top of the screen on phones, bottom centre on desktop.

## Do's and Don'ts

### Do:
- **Do** route every accent through `--season` and set `data-season` on the region it belongs to.
- **Do** show a title's state with the hand mark over its cover, and its score on the obi or the score rail.
- **Do** use one tile size across all bands on the chart, and size each band to its titles.
- **Do** set text on season ink or Paper surfaces in Night Ink (#0d0c12).
- **Do** use Dela Gothic One for every prominent number, and Zen Kaku Gothic New at 700 for labels.
- **Do** keep controls as full pills and covers at a 6px corner.
- **Do** honour `prefers-reduced-motion`; the global rule cuts animation and transition durations to near zero.

### Don't:
- **Don't** show a title's watch state as a coloured badge, pill or label; it is drawn by hand. (The numeric count badge in navigation is a counter, not a title state.)
- **Don't** add a sidebar, stat-card grids or a neon accent; this is a chart poster, not a dashboard.
- **Don't** introduce chrome hues beyond the four season inks and the ink/paper scale; Good and Bad stay as faint notice tints.
- **Don't** use imagery other than cover art.
- **Don't** add uppercase tracked kicker labels above headings.
- **Don't** cast shadows from flat chrome such as bands, buttons, chips or fields.
- **Don't** put a second score scale beside the 1-10 rail.
