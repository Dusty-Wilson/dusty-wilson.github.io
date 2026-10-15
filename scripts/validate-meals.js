#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, recipeMap, validateIndex, validatePlan, validateRecipe, validateRecipeReferences } = require('./lib/meal-plan-core');

function validateRepository(root = path.resolve(__dirname, '..')) {
  const errors = [];
  const warnings = [];
  const index = readJson(path.join(root, 'plans', 'index.json'));
  const indexResult = validateIndex(index, root);
  errors.push(...indexResult.errors);
  const indexedPlanFiles = new Set(index.plans.map(meta => meta.file));
  for (const file of fs.readdirSync(path.join(root, 'plans')).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))) if (!indexedPlanFiles.has(file)) errors.push({ code: 'orphan-plan', path: file, message: `${file} exists but is not indexed.` });
  const recipes = recipeMap(root);

  const recipeIndex = readJson(path.join(root, 'recipes', 'index.json'));
  const indexedRecipeFiles = new Set(recipeIndex.recipes.map(meta => meta.file));
  for (const file of fs.readdirSync(path.join(root, 'recipes')).filter(file => file !== 'index.json' && file.endsWith('.json'))) if (!indexedRecipeFiles.has(file)) errors.push({ code: 'orphan-recipe', path: file, message: `${file} exists but is not indexed.` });
  const recipeIds = new Set();
  for (const meta of recipeIndex.recipes) {
    if (recipeIds.has(meta.id)) errors.push({ code: 'duplicate-recipe', path: 'recipes/index.json', message: `Duplicate recipe ${meta.id}.` });
    recipeIds.add(meta.id);
    const recipe = recipes.get(meta.id);
    if (!recipe || meta.file !== `${meta.id}.json`) errors.push({ code: 'recipe-manifest', path: meta.id, message: 'Recipe manifest id/file mismatch.' });
    else {
      const result = validateRecipe(recipe);
      errors.push(...result.errors.map(item => ({ ...item, path: `${meta.file}:${item.path}` })));
    }
  }

  for (const meta of index.plans) {
    const file = path.join(root, 'plans', meta.file);
    if (!fs.existsSync(file)) continue;
    const plan = readJson(file);
    const result = validatePlan(plan, { expectedId: meta.id, enforceSafety: false });
    errors.push(...result.errors.map(item => ({ ...item, path: `${meta.file}:${item.path}` })));
    warnings.push(...result.warnings.map(item => ({ ...item, path: `${meta.file}:${item.path}` })));
    for (const key of ['title', 'startDate', 'endDate']) if (meta[key] !== plan[key]) errors.push({ code: 'index-metadata', path: `${meta.file}:${key}`, message: `Index ${key} does not match plan.` });
    errors.push(...validateRecipeReferences(plan, recipes, false));
  }
  return { valid: errors.length === 0, errors, warnings, counts: { plans: index.plans.length, recipes: recipes.size } };
}

if (require.main === module) {
  try {
    const result = validateRepository(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.valid ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ valid: false, errors: [{ code: 'exception', message: error.message }] }, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { validateRepository };
