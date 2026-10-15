#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generate } = require('./generate-weekly-plan');
const { addDays, readJson } = require('./lib/meal-plan-core');

function chooseSmokeWeek(root) {
  const index = readJson(path.join(root, 'plans', 'index.json'));
  let week = [...index.plans].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1).startDate;
  do week = addDays(week, 7);
  while (index.plans.some(plan => plan.id === week) || fs.existsSync(path.join(root, 'plans', `${week}.json`)));
  return week;
}

async function run() {
  if (process.env.RUN_OPENAI_SMOKE !== '1') throw new Error('Refusing a paid API request. Set RUN_OPENAI_SMOKE=1 to opt in explicitly.');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for the opt-in integration smoke test.');

  const sourceRoot = path.resolve(__dirname, '..');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-planner-openai-smoke-'));
  try {
    for (const name of ['config', 'plans', 'recipes']) fs.cpSync(path.join(sourceRoot, name), path.join(temporaryRoot, name), { recursive: true });
    const week = process.env.SMOKE_WEEK || chooseSmokeWeek(temporaryRoot);
    const indexFile = path.join(temporaryRoot, 'plans', 'index.json');
    const beforeIndex = fs.readFileSync(indexFile, 'utf8');
    const beforeFiles = fs.readdirSync(path.join(temporaryRoot, 'plans')).sort();

    delete process.env.GENERATOR_RESPONSE_FILE;
    const result = await generate({ root: temporaryRoot, target: week, dryRun: true, maxAttempts: 1 });
    assert.equal(result.outcome, 'validated');
    assert.equal(fs.readFileSync(indexFile, 'utf8'), beforeIndex, 'Dry-run changed the plan index.');
    assert.deepEqual(fs.readdirSync(path.join(temporaryRoot, 'plans')).sort(), beforeFiles, 'Dry-run changed plan files.');

    console.log(JSON.stringify({ ok: true, outcome: result.outcome, week, requests: 1, repositoryChanged: false }, null, 2));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) run().catch(error => {
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
  process.exitCode = 1;
});

module.exports = { chooseSmokeWeek, run };
