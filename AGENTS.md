# Meal-planner repository instructions

GitHub is the source of truth. Preserve the static PWA, every historical file in `plans/`, and the weekly JSON shape documented in the README. Do not add a database, client-side API key, authentication layer, or framework.

## Interactive plan workflow

1. Read `config/household.json`, `config/planning-rules.md`, `recipes/index.json`, the relevant recipe files, and recent plans.
2. Present a complete Monday–Sunday draft in chat. Do not write or publish it yet.
3. Revise until the user explicitly approves that draft.
4. Convert the approved plan without materially changing it. Include separate `dusty` and `sam` portions and a flat grocery string array. Do not add certification or ingredient-review fields.
5. Run `node scripts/publish-plan.js path/to/approved-plan.json --dry-run`, then publish without `--dry-run` only after validation succeeds.
6. Commit only the new plan and updated `plans/index.json`, push through an actually connected GitHub tool, and report the real commit/publication result. Instructions alone do not establish GitHub access.

Never publish an interactive draft without explicit approval. Scheduled Monday generation is separately pre-authorized through `.github/workflows/weekly-meal-plan.yml` and uses the managed recipe catalog. Both workflows must deterministically reject excluded ingredients from `config/household.json`.

## Managed recipe lifecycle

The external Google Sheets meal and recipe log is comprehensive history; it is not the managed catalog and is never read by the scheduled job. Do not add Sheets dependencies or synchronization here.

When the user asks to promote a logged recipe into regular rotation:

1. Retrieve it from the Google Sheets log using the connected chat tools available in that conversation.
2. Prepare one managed recipe JSON entry, preserving recorded ingredients, preparation, quantities, and nutrition.
3. Leave unknown quantities and nutrition as `null`; never infer exact values.
4. Validate structured ingredients and substitutions against `config/household.json#excludedIngredients`.
5. Present the proposed recipe and wait for explicit approval.
6. After approval, add it under `recipes/`, update `recipes/index.json`, validate, and commit through an actually connected GitHub tool.

Never promote recipes automatically based on log frequency. The GitHub catalog contains only explicitly approved rotation meals and is authoritative for weekly planning.

## Required checks

Run `npm test` and `npm run validate`. New plans must pass schema, date, index, recipe-reference, and deterministic ingredient-exclusion checks. Historical plans are immutable legacy data; the all-data validator reports their current-rule conflicts as warnings rather than rewriting them. Exclusions are planning constraints, not medical-safety guarantees.
