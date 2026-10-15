'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generate } = require('../scripts/generate-weekly-plan');
const { publishPlan, readJson } = require('../scripts/lib/meal-plan-core');
const { validateRepository } = require('../scripts/validate-meals');

const ROOT = path.resolve(__dirname, '..');

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
      breakfast: { name: index === 1 || index === 4 ? 'Coffee-shop breakfast' : 'Fruit smoothie and eggs', dusty: ['One household portion'], sam: ['One household portion'] },
      lunch: { name: 'Fresh vegetable and protein plate', dusty: ['Larger household portion'], sam: ['Smaller household portion'] },
      dinner: { name: index === 1 ? 'Tomato pasta with roasted broccoli' : 'Roasted chicken, potatoes and broccoli', dusty: ['Larger household portion'], sam: ['Smaller household portion'] },
      dayNotes: []
    })),
    groceries: ['Chicken: one family package', 'Broccoli: two family bags', 'Potatoes: one standard bag', 'Pasta: one box', 'Tomato sauce: one verified jar'],
    allergenReview: { status: 'verified', packagedIngredientsReviewed: true, notes: ['Test fixture: package labels reviewed.'] }
  };
}

function writeFixture(root, plan) {
  const file = path.join(root, 'draft.json');
  fs.writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
  return file;
}

test('all repository data validates while legacy safety conflicts remain warnings', () => {
  const result = validateRepository(ROOT);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.counts.plans, 4);
  assert.equal(result.counts.recipes, 22);
  assert.ok(result.warnings.some(warning => warning.code === 'legacy-rule-conflict'));
});

test('publishing writes one validated plan and preserves history', () => {
  const root = temporaryRepository();
  const before = readJson(path.join(root, 'plans', 'index.json'));
  const plan = makePlan();
  const result = publishPlan(root, writeFixture(root, plan));
  assert.equal(result.published, true);
  assert.equal(readJson(path.join(root, 'plans', 'index.json')).plans.length, before.plans.length + 1);
  for (const meta of before.plans) assert.ok(fs.existsSync(path.join(root, 'plans', meta.file)));
});

test('publishing rejects duplicate weeks without changing the index', () => {
  const root = temporaryRepository();
  const fixture = writeFixture(root, makePlan());
  publishPlan(root, fixture);
  const before = fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8');
  assert.throws(() => publishPlan(root, fixture), /validation failed/i);
  assert.equal(fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8'), before);
});

test('publishing fails closed on prohibited ingredients and unverified packages', () => {
  const root = temporaryRepository();
  const plan = makePlan();
  plan.groceries.push('Peanut sauce: one jar');
  plan.allergenReview.packagedIngredientsReviewed = false;
  assert.throws(() => publishPlan(root, writeFixture(root, plan)), error => {
    assert.ok(error.results.errors.some(item => item.code === 'prohibited-ingredient'));
    assert.ok(error.results.errors.some(item => item.code === 'allergen-review'));
    return true;
  });
  assert.equal(fs.existsSync(path.join(root, 'plans', `${plan.id}.json`)), false);
});

test('generator is a no-op for an existing valid week', async () => {
  const result = await generate({ root: ROOT, target: '2026-08-24', dryRun: false });
  assert.equal(result.outcome, 'no-op');
});

test('generator publishes a missing week from a mocked response', async () => {
  const root = temporaryRepository();
  const plan = makePlan();
  const responseFile = writeFixture(root, plan);
  const result = await generate({ root, target: plan.id, dryRun: false, responseFile });
  assert.equal(result.outcome, 'published');
  assert.ok(fs.existsSync(path.join(root, 'plans', `${plan.id}.json`)));
  assert.equal(readJson(path.join(root, 'plans', 'index.json')).latest, plan.id);
});

test('failed generation leaves plans and index unchanged', async () => {
  const root = temporaryRepository();
  const plan = makePlan();
  plan.days.pop();
  const responseFile = writeFixture(root, plan);
  const beforeIndex = fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8');
  await assert.rejects(generate({ root, target: plan.id, dryRun: false, responseFile }), /validation failed/i);
  assert.equal(fs.readFileSync(path.join(root, 'plans', 'index.json'), 'utf8'), beforeIndex);
  assert.equal(fs.existsSync(path.join(root, 'plans', `${plan.id}.json`)), false);
});

test('PWA opens the latest plan by default and refresh switches to latest', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(source, /getPlanFromUrl\(\)\|\|state\.index\.latest/);
  assert.doesNotMatch(source, /getPlanFromUrl\(\)\|\|localStorage\.getItem/);
  assert.match(source, /loadPlan\(state\.index\.latest,true\)/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\('week'\)/);
});
