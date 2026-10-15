'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const NUTRITION_FIELDS = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sodium'];
const PROHIBITED_PATTERNS = [
  [/\bpeanuts?\b/i, 'peanut'],
  [/\b(?:almonds?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|brazil nuts?|tree nuts?)\b/i, 'tree nut'],
  [/\bsesame\b|\btahini\b/i, 'sesame'],
  [/\bcoconut\b/i, 'coconut'],
  [/\bgreen beans?\b/i, 'green beans']
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function parseIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function addDays(iso, count) {
  const date = parseIso(iso);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function titleForWeek(startDate, endDate) {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(start);
  if (start.getUTCMonth() === end.getUTCMonth()) return `${month} ${start.getUTCDate()}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  const short = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${short.format(start)}–${short.format(end)}, ${end.getUTCFullYear()}`;
}

function mondayFor(input, timeZone = 'America/Chicago') {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = parseIso(input);
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
    return date.toISOString().slice(0, 10);
  }
  const now = input instanceof Date ? input : new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return mondayFor(`${parts.year}-${parts.month}-${parts.day}`);
}

function collectPlanText(plan) {
  const values = [];
  for (const day of plan.days || []) {
    for (const mealName of ['breakfast', 'lunch', 'dinner']) {
      const meal = day[mealName] || {};
      values.push(meal.name, meal.note, ...(meal.dusty || []), ...(meal.sam || []));
    }
    values.push(...(day.dayNotes || []));
  }
  values.push(...(plan.groceries || []));
  return values.filter(value => typeof value === 'string');
}

function validatePlan(plan, options = {}) {
  const errors = [];
  const warnings = [];
  const expectedId = options.expectedId;
  const required = ['id', 'title', 'startDate', 'endDate', 'updatedAt', 'days', 'groceries'];
  for (const key of required) if (!(key in (plan || {}))) errors.push({ code: 'missing-field', path: key, message: `Missing required field: ${key}` });
  if (!plan || typeof plan !== 'object') return { valid: false, errors, warnings };
  if (!parseIso(plan.id) || plan.id !== plan.startDate) errors.push({ code: 'invalid-id', path: 'id', message: 'Plan id must be its ISO start date.' });
  if (expectedId && plan.id !== expectedId) errors.push({ code: 'unexpected-id', path: 'id', message: `Expected plan id ${expectedId}.` });
  const start = parseIso(plan.startDate);
  if (!start || start.getUTCDay() !== 1) errors.push({ code: 'not-monday', path: 'startDate', message: 'startDate must be a Monday.' });
  if (addDays(plan.startDate, 6) !== plan.endDate) errors.push({ code: 'not-sunday', path: 'endDate', message: 'endDate must be the following Sunday.' });
  if (start && parseIso(plan.endDate) && plan.title !== titleForWeek(plan.startDate, plan.endDate)) errors.push({ code: 'plan-title', path: 'title', message: `Expected title ${titleForWeek(plan.startDate, plan.endDate)}.` });
  if (!parseIso(plan.updatedAt)) errors.push({ code: 'invalid-date', path: 'updatedAt', message: 'updatedAt must be an ISO date.' });
  if (!Array.isArray(plan.days) || plan.days.length !== 7) errors.push({ code: 'day-count', path: 'days', message: 'Plan must contain exactly seven days.' });
  else plan.days.forEach((day, index) => {
    const base = `days[${index}]`;
    if (day.day !== DAYS[index]) errors.push({ code: 'day-name', path: `${base}.day`, message: `Expected ${DAYS[index]}.` });
    if (day.date !== addDays(plan.startDate, index)) errors.push({ code: 'day-date', path: `${base}.date`, message: 'Days must be consecutive.' });
    for (const mealName of ['breakfast', 'lunch', 'dinner']) {
      const meal = day[mealName];
      if (!meal || typeof meal.name !== 'string' || !meal.name.trim()) errors.push({ code: 'meal-name', path: `${base}.${mealName}`, message: 'Meal must have a name.' });
      for (const person of ['dusty', 'sam']) if (!Array.isArray(meal?.[person]) || !meal[person].length || meal[person].some(item => typeof item !== 'string' || !item.trim())) errors.push({ code: 'portion', path: `${base}.${mealName}.${person}`, message: `${person} needs a non-empty string array.` });
      if (meal?.recipeId && typeof meal.recipeId !== 'string') errors.push({ code: 'recipe-id', path: `${base}.${mealName}.recipeId`, message: 'recipeId must be a string.' });
    }
    if (day.dayNotes !== undefined && (!Array.isArray(day.dayNotes) || day.dayNotes.some(note => typeof note !== 'string'))) errors.push({ code: 'day-notes', path: `${base}.dayNotes`, message: 'dayNotes must be a string array.' });
  });
  if (!Array.isArray(plan.groceries) || plan.groceries.some(item => typeof item !== 'string' || !item.trim())) errors.push({ code: 'groceries', path: 'groceries', message: 'groceries must be a flat array of non-empty strings.' });

  if (options.enforceSafety) {
    for (const value of collectPlanText(plan)) for (const [pattern, label] of PROHIBITED_PATTERNS) if (pattern.test(value)) errors.push({ code: 'prohibited-ingredient', path: 'plan', message: `Prohibited ingredient reference (${label}): ${value}` });
    if (plan.allergenReview?.status !== 'verified' || plan.allergenReview?.packagedIngredientsReviewed !== true) errors.push({ code: 'allergen-review', path: 'allergenReview', message: 'New plans require verified allergen review, including packaged ingredients.' });
  } else {
    const matches = new Set();
    for (const value of collectPlanText(plan)) for (const [pattern, label] of PROHIBITED_PATTERNS) if (pattern.test(value)) matches.add(label);
    if (matches.size) warnings.push({ code: 'legacy-rule-conflict', path: 'plan', message: `Historical plan contains current-rule conflicts: ${[...matches].join(', ')}.` });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateRecipe(recipe) {
  const errors = [];
  for (const key of ['id', 'name', 'description', 'category', 'tags', 'rotationStatus', 'favorite', 'ingredients', 'preparation', 'servings', 'nutritionPerServing', 'planning', 'householdAllergyVerification']) if (!(key in (recipe || {}))) errors.push({ code: 'missing-field', path: key, message: `Missing required field: ${key}` });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe?.id || '')) errors.push({ code: 'recipe-id', path: 'id', message: 'Recipe id must be a stable kebab-case id.' });
  if (!Array.isArray(recipe?.ingredients) || !recipe.ingredients.length) errors.push({ code: 'ingredients', path: 'ingredients', message: 'Recipe needs at least one ingredient.' });
  else recipe.ingredients.forEach((ingredient, index) => {
    if (!ingredient.name || !('quantity' in ingredient) || !('unit' in ingredient) || !Array.isArray(ingredient.allergens) || !ingredient.verification) errors.push({ code: 'ingredient-shape', path: `ingredients[${index}]`, message: 'Ingredient requires name, nullable quantity/unit, allergens, and verification.' });
  });
  const prep = recipe?.preparation;
  if (!prep || !Array.isArray(prep.instructions) || !prep.instructions.length || !('prepMinutes' in prep) || !('cookMinutes' in prep) || !Array.isArray(prep.methods) || !Array.isArray(prep.equipment)) errors.push({ code: 'preparation', path: 'preparation', message: 'Preparation metadata is incomplete.' });
  const nutrition = recipe?.nutritionPerServing;
  if (!nutrition || !['verified', 'estimated', 'unknown'].includes(nutrition.status)) errors.push({ code: 'nutrition-status', path: 'nutritionPerServing.status', message: 'Nutrition status must be verified, estimated, or unknown.' });
  else {
    for (const field of NUTRITION_FIELDS) if (!(field in nutrition) || (nutrition[field] !== null && typeof nutrition[field] !== 'number')) errors.push({ code: 'nutrition-value', path: `nutritionPerServing.${field}`, message: 'Nutrition fields must be numbers or null.' });
    if (nutrition.status === 'unknown' && NUTRITION_FIELDS.some(field => nutrition[field] !== null)) errors.push({ code: 'unknown-nutrition', path: 'nutritionPerServing', message: 'Unknown nutrition values must be null.' });
  }
  if (!['verified', 'unverified'].includes(recipe?.householdAllergyVerification?.status)) errors.push({ code: 'allergy-status', path: 'householdAllergyVerification.status', message: 'Allergy status must be verified or unverified.' });
  return { valid: errors.length === 0, errors, warnings: [] };
}

function validateIndex(index, root) {
  const errors = [];
  if (!index || typeof index.latest !== 'string' || !Array.isArray(index.plans)) return { valid: false, errors: [{ code: 'index-shape', path: 'plans/index.json', message: 'Index requires latest and plans.' }], warnings: [] };
  const ids = new Set();
  for (const meta of index.plans) {
    if (ids.has(meta.id)) errors.push({ code: 'duplicate-plan', path: 'plans/index.json', message: `Duplicate plan ${meta.id}.` });
    ids.add(meta.id);
    if (meta.file !== `${meta.id}.json`) errors.push({ code: 'plan-filename', path: meta.file, message: `Plan ${meta.id} must use ${meta.id}.json.` });
    if (!fs.existsSync(path.join(root, 'plans', meta.file))) errors.push({ code: 'missing-plan', path: meta.file, message: `Missing referenced plan file ${meta.file}.` });
  }
  if (!ids.has(index.latest)) errors.push({ code: 'latest-missing', path: 'latest', message: 'latest must reference an indexed plan.' });
  const newest = [...index.plans].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1)?.id;
  if (newest && index.latest !== newest) errors.push({ code: 'latest-not-newest', path: 'latest', message: `latest must be newest plan ${newest}.` });
  return { valid: errors.length === 0, errors, warnings: [] };
}

function recipeMap(root) {
  const index = readJson(path.join(root, 'recipes', 'index.json'));
  return new Map(index.recipes.map(meta => [meta.id, readJson(path.join(root, 'recipes', meta.file))]));
}

function validateRecipeReferences(plan, recipes, enforceSafety) {
  const errors = [];
  for (const day of plan.days || []) for (const mealName of ['breakfast', 'lunch', 'dinner']) {
    const id = day[mealName]?.recipeId;
    if (!id) continue;
    if (!recipes.has(id)) errors.push({ code: 'unknown-recipe', path: `${day.date}.${mealName}`, message: `Unknown recipe reference: ${id}` });
    else if (enforceSafety && recipes.get(id).householdAllergyVerification.status !== 'verified') errors.push({ code: 'unverified-recipe', path: `${day.date}.${mealName}`, message: `Recipe ${id} is not verified for household allergens.` });
  }
  return errors;
}

function publishPlan(root, sourceFile, options = {}) {
  const plan = readJson(sourceFile);
  const indexFile = path.join(root, 'plans', 'index.json');
  const index = readJson(indexFile);
  const result = validatePlan(plan, { expectedId: plan.id, enforceSafety: true });
  result.errors.push(...validateRecipeReferences(plan, recipeMap(root), true));
  const destination = path.join(root, 'plans', `${plan.id}.json`);
  if (fs.existsSync(destination) || index.plans.some(meta => meta.id === plan.id)) result.errors.push({ code: 'duplicate-plan', path: plan.id, message: 'A plan for this week already exists; it will not be overwritten.' });
  if (result.errors.length) {
    const error = new Error('Plan validation failed.');
    error.results = { ...result, valid: false };
    throw error;
  }
  const meta = { id: plan.id, title: plan.title, startDate: plan.startDate, endDate: plan.endDate, file: `${plan.id}.json` };
  const nextIndex = { latest: plan.id, plans: [...index.plans, meta].sort((a, b) => a.startDate.localeCompare(b.startDate)) };
  if (!options.dryRun) {
    writeJson(destination, plan);
    writeJson(indexFile, nextIndex);
  }
  return { published: !options.dryRun, planId: plan.id, destination, index: nextIndex };
}

module.exports = { DAYS, PROHIBITED_PATTERNS, addDays, mondayFor, publishPlan, readJson, recipeMap, titleForWeek, validateIndex, validatePlan, validateRecipe, validateRecipeReferences, writeJson };
