#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { publishPlan } = require('./lib/meal-plan-core');

const source = process.argv[2];
if (!source) {
  console.error('Usage: node scripts/publish-plan.js PLAN.json [--dry-run]');
  process.exit(2);
}

try {
  const result = publishPlan(path.resolve(__dirname, '..'), path.resolve(source), { dryRun: process.argv.includes('--dry-run') });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, validation: error.results || null }, null, 2));
  process.exitCode = 1;
}
