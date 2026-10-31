# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the owner's brainstorm and `docs/superpowers/specs/2026-11-01-konomi-design.md`. The owner
> said "the look — just figure it out, we will see tomorrow" and went to sleep, so no interview round ran.

## Platform

web

## Stack

React 19 + TypeScript + Vite SPA, FastAPI + Postgres/pgvector API, PyTorch-trained taste model served on CPU.
Delegated: the owner left stack and look to Claude.

## Users

Primary: Pratham — software engineer, long-time anime fan, ~5,000 hours of music, plays Valorant, builds playful
interactive things (his portfolio is a wall of pressable posters). Then: friends he shares a profile link with,
who sign up with email + password. People who already keep a MAL/AniList list and are tired of it.

## Product Purpose

A personal anime list where (1) adding a show takes a keystroke, (2) scores come from quick comparisons instead
of a 1–10 slider, so "everything is a 10" stops happening, and (3) a taste model trained on 56.5M real
MyAnimeList ratings recommends, predicts scores and visualises taste. Success: the owner keeps his list here
instead of MAL and shares his profile.

## Positioning

The only list that never asks you for a number. Your score is derived from "which did you enjoy more?" duels,
and the model guesses your score before revealing its guess — then shows how close it was.

## Operating Context

Used in short bursts: right after finishing an episode/season (phone, in bed, at night), and long sessions on
a desktop sweeping through years of watched shows. Shared via WhatsApp/Discord link previews.

## Capabilities and Constraints

- Catalog of 39.8k anime (anime-offline-database, ODbL) with covers hotlinked from MAL/AniList/etc. CDNs.
- Statuses: completed, watching, dropped, planned. Feeling tiers: One of my favourites / Loved it / Liked it /
  It was okay / Didn't like it → bands 9.0–10 / 8.0–8.9 / 6.5–7.9 / 5.0–6.4 / 1.0–4.9.
- No adult/hentai titles. Ecchi allowed.
- Profiles private by default; public toggle.
- Must work on phones (360–430 px) through 13/14/15.6" laptops and 24"/27" monitors.

## Brand Commitments

- Name: **Konomi** (好み, "taste"). The kanji may appear as a mark.
- Not AI-slop, not a dashboard. Vibrant, clean, fluid.

## Evidence on Hand

- Real cover art for every title (hotlinked). Real AniList cover colours for ~6k+ titles.
- Real model metrics in `docs/model-report.md` (do not invent accuracy numbers anywhere in the UI).
- No testimonials, no user counts — never fabricate them.

## Product Principles

1. Adding must be faster than thinking about it.
2. Ask questions people can answer honestly; never ask for a number.
3. The model proves itself — show its guess after the user answers, and its track record.
4. Cover art is the colour; chrome stays out of the way.
5. Every screen is self-explanatory on first visit.

## Accessibility & Inclusion

Keyboard-first adding with visible focus; full touch support; respect `prefers-reduced-motion`; text contrast
WCAG AA on the dark ground; never rely on colour alone for status.
