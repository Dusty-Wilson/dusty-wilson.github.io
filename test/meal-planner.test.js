'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildPrompt, generate } = require('../scripts/generate-weekly-plan');
const { publishPlan, readJson, validateRecipe } = require('../scripts/lib/meal-plan-core');
const { validateRepository } = require('../scripts/validate-meals');

const ROOT = path.resolve(__dirname, '..');
const EXCLUSIONS = readJson(path.join(ROOT, 'config', 'household.json')).excludedIngredients;

test('household exclusions contain exactly the four requested ingredient groups', () => {
  assert.deepEqual(EXCLUSIONS, ['peanuts', 'tree nuts', 'sesame', 'coconut']);
});

function temporaryRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-planner-repo-'));
  for (const name of ['config', 'plans', 'recipes']) fs.cpSync(path.join(ROOT, name), path.join(root, name), { recursive: true });
  return root;
}

function makePlan(startDate = '2026-09-07') {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return {
    id: startDate,
    title: 'September 7–13, 2026',
    startDate,
    endDate: dates[6],
    updatedAt: startDate,
    days: days.map((day, index) => ({
      day,
      date: dates[index],
      breakfast: { name: index === 1 || index === 4 ? 'Coffee-shop breakfast' : 'Fruit smoothie and eggs', dusty: ['One household portion'], sam: ['One household portion'], recipeId: null, note: null },
      lunch: { name: 'Fresh vegetable and protein plate', dusty: ['Larger household portion'], sam: ['Smaller household portion'], recipeId: null, note: null },
      dinner: index === 1
        ? { name: 'Spaghetti and meatballs', dusty: ['Larger household portion'], sam: ['Smaller household portion'], recipeId: 'spaghetti-meatballs', note: null }
        : { name: 'Sheet-pan curry chicken', dusty: ['Larger household portion'], sam: ['Smaller household portion'], recipeId: 'sheet-pan-curry-chicken', note: null },
      dayNotes: []
    })),
    groceries: ['Chicken: one family package', 'Broccoli: two family bags', 'Potatoes: one standard bag', 'Pasta: one box', 'Tomato sauce: one jar']
  };
}

function makeRecipe(ingredientName) {
  const recipe = structuredClone(readJson(path.join(ROOT, 'recipes', 'beef-ragu.json')));
  recipe.id = 'test-recipe';
  recipe.name = 'Test recipe';
  recipe.ingredients = [{ name: ingredientName, quantity: null, unit: null, preparation: null, substitutions: [] }];
  recipe.planning.groceryIngredients = [ingredientName];
  return recipe;
}

function writeFixture(root, plan) {
  const file = path.join(root, 'draft.json');
  fs.writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
  return file;
}

function assertRecipeRejected(ingredientName, expectedGroup) {
  const result = validateRecipe(makeRecipe(ingredientName), { excludedIngredients: EXCLUSIONS });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === 'excluded-ingredient' && error.message.includes(expectedGroup)), JSON.stringify(result.errors));
}

test('all 22 established recipes remain managed and available to generation', () => {
  const index = readJson(path.join(ROOT, 'recipes', 'index.json'));
  assert.equal(index.recipes.length, 22);
  for (const entry of index.recipes) assert.ok(fs.existsSync(path.join(ROOT, 'recipes', entry.file)));
  const prompt = buildPrompt(ROOT, '2026-09-07');
  for (const entry of index.recipes) assert.match(prompt, new RegExp(`"id":"${entry.id}"`));
});

test('a managed recipe containing peanuts is rejected', () => assertRecipeRejected('peanut butter', 'peanuts'));
test('a managed recipe containing a tree nut is rejected', () => assertRecipeRejected('almond flour', 'tree nuts'));
test('a managed recipe containing sesame is rejected', () => assertRecipeRejected('sesame oil', 'sesame'));
test('a managed recipe containing coconut is rejected', () => assertRecipeRejected('coconut milk', 'coconut'));

test('common alternate names and derivatives are detected', () => {
  for (const [ingredient, group] of [['groundnut oil', 'peanuts'], ['marzipan', 'tree nuts'], ['pignoli', 'tree nuts'], ['Nutella', 'tree nuts'], ['tahini', 'sesame'], ['benne seeds', 'sesame'], ['copra oil', 'coconut']]) assertRecipeRejected(ingredient, group);
});

test('negative recipe notes do not create false positives', () => {
  const recipe = makeRecipe('tomato sauce');
  recipe.planning.prepNotes = 'Do not use tahini or pine nuts.';
  recipe.ingredients[0].substitutions = ['sesame-free tomato sauce'];
  assert.equal(validateRecipe(recipe, { excludedIngredients: EXCLUSIONS }).valid, true);
});

test('a shopping list containing an excluded ingredient is rejected', () => {
  const root = temporaryRepository();
  const plan = makePlan();
  plan.groceries.push('Tahini: one jar');
  assert.throws(() => publishPlan(root, writeFixture(root, plan)), error => {
    assert.ok(error.results.errors.some(item => item.code === 'excluded-ingredient'));
    return true;
  });
});

test('missing nutrition and manufacturer-verification metadata do not block recipes or publication', () => {
  const recipe = makeRecipe('tomato sauce');
  delete recipe.nutritionPerServing;
  assert.equal(validateRecipe(recipe, { excludedIngredients: EXCLUSIONS }).valid, true);
  const root = temporaryRepository();
  const managedFile = path.join(root, 'recipes', 'sheet-pan-curry-chicken.json');
  const managedRecipe = readJson(managedFile);
  delete managedRecipe.nutritionPerServing;
  fs.writeFileSync(managedFile, `${JSON.stringify(managedRecipe)}\n`);
  assert.equal(publishPlan(root, writeFixture(root, makePlan())).published, true);
});

test('automatic generation uses managed recipes and does not require Google Sheets', async () => {
  const root = temporaryRepository();
  const plan = makePlan();
  const prompt = buildPrompt(root, plan.id);
  assert.match(prompt, /MANAGED_RECIPES=/);
  assert.doesNotMatch(prompt, /Google Sheets/i);
  const result = await generate({ root, target: plan.id, dryRun: false, responseFile: writeFixture(root, plan) });
  assert.equal(result.outcome, 'published');
});

test('automatic generation rejects a home dinner without a managed recipe reference', async () => {
  const root = temporaryRepository();
  const plan = makePlan();
  plan.days[0].dinner.recipeId = null;
  await assert.rejects(generate({ root, target: plan.id, dryRun: false, responseFile: writeFixture(root, plan) }), /must reference a managed recipe/i);
});

test('existing-week scheduled runs remain no-ops', async () => {
  const result = await generate({ root: ROOT, target: '2026-08-24', dryRun: false });
  assert.equal(result.outcome, 'no-op');
});

test('failed validation leaves plans and index unchanged', async () => {
  const root = temporaryRepository();
  const plan = makePlan();
  plan.groceries.push('Coconut cream');
  const beforeIndex = fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8');
  await assert.rejects(generate({ root, target: plan.id, dryRun: false, responseFile: writeFixture(root, plan) }), /validation failed/i);
  assert.equal(fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8'), beforeIndex);
  assert.equal(fs.existsSync(path.join(root, 'plans', `${plan.id}.json`)), false);
});

test('duplicates are rejected and historical plans remain unchanged and loadable', () => {
  const root = temporaryRepository();
  const historicalBefore = new Map(readJson(path.join(root, 'plans', 'index.json')).plans.map(meta => [meta.file, fs.readFileSync(path.join(root, 'plans', meta.file), 'utf8')]));
  const fixture = writeFixture(root, makePlan());
  publishPlan(root, fixture);
  const beforeDuplicate = fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8');
  assert.throws(() => publishPlan(root, fixture), /validation failed/i);
  assert.equal(fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8'), beforeDuplicate);
  for (const [file, contents] of historicalBefore) assert.equal(fs.readFileSync(path.join(root, 'plans', file), 'utf8'), contents);
  assert.equal(validateRepository(ROOT).valid, true);
});

test('latest-week selection, refresh, and archived URLs remain functional', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(source, /getPlanFromUrl\(\)\|\|state\.index\.latest/);
  assert.doesNotMatch(source, /getPlanFromUrl\(\)\|\|localStorage\.getItem/);
  assert.match(source, /loadPlan\(state\.index\.latest,true\)/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('week'\)/);
});
