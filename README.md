# Dusty & Sam Meal Plan PWA

## Initial deployment

Upload every file and folder in this package to the root of the GitHub repository.

The repository root should contain:

- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- README.md
- icons/
- plans/

Enable GitHub Pages under Settings → Pages → Deploy from a branch → main → / (root).

## Weekly update

1. Add the new weekly JSON file to `plans/`. Do not delete or replace prior weekly files.
2. Edit `plans/index.json`.
3. Change `latest` to the new plan ID.
4. Add the new plan metadata to the `plans` array while preserving prior entries.
5. Commit both changes.

The groceries field is a flat array of strings. The app displays the strings as plain lines with no bullets or categories and provides one Copy list button.
