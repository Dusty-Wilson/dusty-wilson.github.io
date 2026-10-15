# Dusty & Sam Meal Plan PWA

A static, installable GitHub Pages meal planner backed by version-controlled weekly plans, household rules, and a recipe catalog. There is no database or client-side AI integration.

## Repository layout

- `plans/index.json` is the published-plan manifest; `latest` must name its newest entry.
- `plans/YYYY-MM-DD.json` holds immutable Monday–Sunday plans.
- `recipes/index.json` and one JSON file per recipe form the recipe catalog.
- `config/household.json` contains machine-readable household defaults and safety rules.
- `config/planning-rules.md` contains the concise planning policy used in chat and scheduled generation.
- `scripts/` contains shared validation, publishing, and AI-generation code.
- `.github/workflows/weekly-meal-plan.yml` runs the unattended publisher.

The groceries field remains a flat array of strings for compatibility with the existing PWA.

## Existing-application audit and compatibility

The PWA is plain HTML, CSS and JavaScript. GitHub Pages serves the repository root; there is no separate deployment workflow. `app.js` reads only `plans/index.json`, renders the seven-day schema, stores the selected week for old clients, and supports `?week=YYYY-MM-DD` archived links. The service worker uses network-first caching for the page and everything under `plans/`, with cache-first handling for the versioned app shell.

The obsolete root-level `index.json` was not referenced by the HTML, app, service worker, manifest, or README and has been removed. All files under `plans/` were preserved unchanged.

Normal app launches now use `plans/index.json#latest`; the old `selectedPlan` local-storage value no longer pins a normal launch to an archived week. An explicit `?week=` URL still opens that archive, the selector still navigates history, and Refresh reloads the index without cache and opens the latest published plan. The service-worker cache version was bumped so updated application code reaches installed PWAs while offline shell behavior remains available.

Historical plans predate the current restrictions and include some now-prohibited meal text. They remain immutable. Repository validation reports those conflicts as legacy warnings, while every newly published plan uses fail-closed safety validation.

## Initial configuration

1. In **Settings → Pages**, deploy from `main` at `/ (root)`.
2. In **Settings → Actions → General**, allow Actions to run and give workflows read/write repository permission. The workflow itself requests only `contents: write`.
3. Add an Actions secret named `OPENAI_API_KEY`. Never place it in repository files or browser JavaScript.
4. Optionally add an Actions variable named `OPENAI_MODEL`. The default is `gpt-5.4-mini`.
5. Review each recipe's ingredient brands and cross-contact labels. Change `householdAllergyVerification.status` to `verified` only after the current packaged ingredients have actually been checked. Seeded recipes intentionally remain unverified where details are missing.
6. Protect `main` as desired, but allow the scheduled workflow's GitHub token to push if automatic publication should work. If branch protection requires pull requests, use a dedicated automation exception or change the workflow to open a PR.

The public repository necessarily exposes the household preferences stored here. Keep private facts out of `config/` and recipes.

## Interactive planning through ChatGPT

The required agent procedure is in `AGENTS.md`:

1. Read household configuration, planning rules, recipes, and recent plans.
2. Present a full draft and wait for explicit approval.
3. Convert the approved plan without materially changing it.
4. Validate with `node scripts/publish-plan.js approved-plan.json --dry-run`.
5. Publish only after approval by rerunning without `--dry-run`, then commit the new plan and manifest.

The publishing step works only when the ChatGPT/Codex environment has a GitHub connection with write access to this repository. Repository instructions do not create that connection. A local session can alternatively use an authenticated Git credential or GitHub CLI. Always report the actual commit/push result; never describe a draft as published.

New plans require an `allergenReview` object with `status: "verified"` and `packagedIngredientsReviewed: true`. That assertion represents a real review—it is not permission to guess.

## Automatic Monday workflow

GitHub Actions runs at 1:00 AM every Monday using the IANA timezone `America/Chicago`, so daylight-saving transitions are handled by GitHub's timezone-aware scheduler. A concurrency group prevents overlapping publishers.

The job:

1. Validates the repository.
2. Resolves the current Central-time Monday (or a manually supplied Monday).
3. Exits successfully without changes if that indexed file already exists and is valid.
4. Sends household rules, only allergy-verified recipes, and four recent plans to the OpenAI Responses API.
5. Retries transient generation failures up to three times.
6. Runs the same schema, date, recipe-reference, index, and allergy checks used by manual publishing.
7. Writes and commits only the new plan and updated plan index.

Malformed output, incomplete meals, a duplicate/partial week, a prohibited ingredient, an unverified referenced recipe, or missing package review causes a nonzero exit without changing the repository. Recipes and historical plans are never changed by this workflow.

To rerun, open **Actions → Weekly meal plan → Run workflow**. Leave `target_week` blank for the current Central-time week or enter a Monday as `YYYY-MM-DD`.

Troubleshooting starts in the failed workflow log. Common causes are a missing/expired `OPENAI_API_KEY`, unavailable model name, unverified recipe/package data, invalid AI JSON, branch protection blocking the bot push, or a partial plan/index state that requires human repair.

### API use and cost

The scheduled job makes no paid call when a valid week already exists and normally makes one generation call for a missing week (up to three attempts after transient failures). Cost equals the selected model's current input/output token rates; the input includes the recipe catalog and four recent plans. Check OpenAI's current API pricing before enabling it and set account usage limits. In practice this is one modest text-generation request per generated week, but the repository does not promise a fixed dollar amount because catalog size, output length, retries, and model pricing vary.

## Recipe management

Each recipe contains identity, tags/rotation metadata, ingredients and substitutions, allergen facts and verification state, preparation, equipment, yield/portion guidance, planning/storage metadata, and nutrition.

Nutrition status is one of:

- `verified`: based on specified quantities and reliable nutrient data.
- `estimated`: calculated from documented assumptions.
- `unknown`: insufficient information; all nutrient values must be `null`, never zero.

To add or modify a recipe, prepare the recipe file and `recipes/index.json` entry in chat, wait for explicit approval, run validation, then commit. Unknown quantities and manufacturer safety stay unverified.

## Validation and local commands

Node.js 20 or newer is required. There are no third-party runtime dependencies.

```sh
npm test
npm run validate
node scripts/publish-plan.js path/to/approved-plan.json --dry-run
node scripts/generate-weekly-plan.js --week 2026-09-07 --dry-run
```

`npm run validate` checks every indexed historical file, every recipe, both manifests, consecutive Monday–Sunday dates, meal/portion completeness, nutrition types, filenames, missing files, and duplicates. New-plan publication adds strict allergy and package-review checks. Tests use mocked AI JSON and never make a paid request.

## Weekly plan shape

```json
{
  "id": "YYYY-MM-DD",
  "title": "Month D–D, YYYY",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "updatedAt": "YYYY-MM-DD",
  "days": [
    {
      "day": "Monday",
      "date": "YYYY-MM-DD",
      "breakfast": { "name": "...", "dusty": ["..."], "sam": ["..."] },
      "lunch": { "name": "...", "dusty": ["..."], "sam": ["..."] },
      "dinner": { "name": "...", "dusty": ["..."], "sam": ["..."] },
      "dayNotes": []
    }
  ],
  "groceries": ["plain text line"],
  "allergenReview": {
    "status": "verified",
    "packagedIngredientsReviewed": true,
    "notes": ["What was actually checked"]
  }
}
```

Meals may include a `recipeId` and `note`. When supplied, `recipeId` must exist; strict publication also requires that recipe's household allergy status to be verified.

## Current limitations

- ChatGPT cannot push merely because `AGENTS.md` describes the process; its environment needs a real authorized GitHub connection.
- The initial catalog preserves incomplete household knowledge. Those entries cannot be used by the unattended publisher until their brands/labels and full ingredients are reviewed.
- Deterministic checks catch known prohibited terms and unverified references, but cannot inspect a manufacturer's changing physical label. Human package review remains necessary.
- Scheduled workflows run from the default branch and may be delayed by GitHub Actions; public-repository schedules can also be disabled after prolonged repository inactivity.
