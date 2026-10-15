# Meal-planner repository instructions

GitHub is the source of truth. Preserve the static PWA, every historical file in `plans/`, and the weekly JSON shape documented in the README. Do not add a database, client-side API key, authentication layer, or framework.

## Interactive plan workflow

1. Read `config/household.json`, `config/planning-rules.md`, `recipes/index.json`, the relevant recipe files, and recent plans.
2. Present a complete Monday–Sunday draft in chat. Do not write or publish it yet.
3. Revise until the user explicitly approves that draft.
4. Convert the approved plan without materially changing it. Include separate `dusty` and `sam` portions, a flat grocery string array, and an `allergenReview` object documenting human/package review.
5. Run `node scripts/publish-plan.js path/to/approved-plan.json --dry-run`, then publish without `--dry-run` only after validation succeeds.
6. Commit only the new plan and updated `plans/index.json`, push through an actually connected GitHub tool, and report the real commit/publication result. Instructions alone do not establish GitHub access.

Never publish an interactive draft without explicit approval. Scheduled Monday generation is separately pre-authorized through `.github/workflows/weekly-meal-plan.yml` and must use only verified recipe data.

## Recipe workflow

Propose one structured recipe JSON file and its manifest entry. Preserve unknown quantities and nutrition as `null`; never infer exact nutrition. Publish a recipe change only after explicit approval, validation, and a real GitHub commit.

## Required checks

Run `npm test` and `npm run validate`. New plans must pass schema, date, index, recipe-reference, and deterministic allergy checks. Historical plans are immutable legacy data; the all-data validator reports their current-rule conflicts as warnings rather than rewriting them.
