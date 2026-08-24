# Broaden Listing Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the studio candidate set beyond Guui-dong one-room listings to nearby neighborhoods, wider monthly-cost bands, and usable two-room, office, shop, and detached-house layouts.

**Architecture:** Keep the existing data schema and site design unchanged. Add only listings supported by opened detail screens, record excluded listings in `data/log.json`, and preserve the one-site-per-research-round rule.

**Tech Stack:** JSON data, Node.js validation/build scripts, in-app browser detail-screen inspection.

---

### Task 1: Reconcile the current queue and baseline

**Files:**
- Read: `C:/dev/studio-hunt/AGENTS.md`, `C:/dev/studio-hunt/next.mjs`, `C:/dev/studio-hunt/tasks.mjs`
- Read: `C:/dev/studio-hunt/data/listings.json`, `C:/dev/studio-hunt/data/config.json`
- Read: `C:/dev/studio-hunt/logs/state.json`, `C:/dev/studio-hunt/logs/known_items.txt`

- [x] Confirm the current queue, existing listing kinds, neighborhoods, monthly costs, and duplicate IDs.
- [x] Confirm the calculated minimum shooting area and 15-minute first-priority walking radius.

### Task 2: Research one listing source with a wider search scope

**Files:**
- Modify: `C:/dev/studio-hunt/data/listings.json`
- Modify: `C:/dev/studio-hunt/data/log.json`
- Modify: `C:/dev/studio-hunt/logs/known_items.txt`

- [x] Use one listing site only for this round, searching neighborhoods beyond Guui-dong such as Jayang-dong, Neung-dong, Junggok-dong, Hwayang-dong, Gunja, and nearby Seongsu.
- [x] Include office and larger studio-like layouts; do not limit the search to one-room listings.
- [x] Keep candidates across a wider monthly-cost range, and explicitly mark monthly totals over 100만원 in each candidate's `cons` and `notes`.
- [x] Record only facts visible on the opened detail screen, with exact detail URLs, null for unknown values, and no seller or broker personal information.
- [x] Add each processed detail/listing ID once to `logs/known_items.txt`; record both accepted and excluded screens in one `data/log.json` entry.

### Task 3: Verify and publish data changes

**Files:**
- Modify: `C:/dev/studio-hunt/logs/state.json`

- [x] Run `node validate.mjs` and fix only data-format errors if present.
- [x] If listing data changed and validation passes, run `npm run build`.
- [ ] Commit and push the data and checkpoint changes, then run `npx vercel --prod --yes` from `C:/dev/studio-hunt`.
- [ ] Recheck `git status --short --branch` and record the next single task in `logs/state.json`.

### Completion audit

- [ ] Confirm the expanded set contains multiple neighborhoods and at least one non-one-room kind supported by detail-screen URLs.
- [ ] Confirm monthly costs use 만원, unknown fields remain null, and no listing source URL is a search-results page.
- [ ] Confirm validation, build, GitHub push, and Vercel deployment results.
