# Studio Hunt Research Loop Implementation Plan

> **For agentic workers:** Use the repository's existing one-task loop and validation commands. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a current, evidence-backed comparison of walkable podcast-studio spaces, equipment, interior items, rental rates, legal-use questions, and budget plans in `C:\dev\studio-hunt`.

**Architecture:** `next.mjs` selects exactly one missing-data task from the JSON files. Browser research records only facts visible on a real detail screen; `data/log.json` records the evidence and exclusions. `validate.mjs`, `npm run build`, Git, and Vercel provide the delivery gates.

**Tech Stack:** Node.js ES modules, JSON data, npm build scripts, Git, Vercel CLI, Codex in-app browser.

---

### Task 1: Inspect the current research queue

**Files:**
- Read: `AGENTS.md`, `next.mjs`, `tasks.mjs`, `logs/state.json`, `logs/known_items.txt`, `data/*.json`

- [ ] Run `git status --short --branch` and read the state, ledger, and all JSON data.
- [ ] Run `node next.mjs` from the repository root.
- [ ] Process only the printed task and use only one research site in that loop.

### Task 2: Record one evidence-backed data change

**Files:**
- Modify: `data/listings.json`, `data/log.json`, `logs/state.json`, `logs/known_items.txt`

- [ ] Open the actual listing, product, or rental detail screen.
- [ ] Record exact visible values with repository units; use `null` for values not visible.
- [ ] Keep private seller or broker details out of public JSON.
- [ ] Add one dated log entry describing confirmed facts and exclusions.
- [ ] Append a unique item ledger line without duplicating an existing ID.

### Task 3: Verify and deliver only when data changed

**Files:**
- Read: `validate.mjs`, `package.json`, `vercel.json`

- [ ] Run `node validate.mjs` and stop before commit if it fails.
- [ ] If JSON data changed, run `npm run build`.
- [ ] Review `git diff --check` and the staged diff, then run `git add -A`, `git commit -m "..."`, and `git push`.
- [ ] Run `npx vercel --prod --yes` from `C:\dev\studio-hunt`.
- [ ] Write the checkpoint and next action to `logs/state.json` before the next loop.

### Task 4: Audit completion or continue the queue

**Files:**
- Read: `next.mjs`, all `data/*.json`, `logs/state.json`, `logs/known_items.txt`

- [ ] Run `node next.mjs` again and compare the output with the current data.
- [ ] Continue only with the next printed task; do not skip ahead.
- [ ] Mark the goal complete only after the data, validation, build, GitHub, and Vercel checks all have fresh evidence.
