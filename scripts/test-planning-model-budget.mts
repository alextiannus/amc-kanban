import assert from 'node:assert/strict'
import {fullPlanningScope,nativeOutputTokens} from '../src/lib/ai-native/planning-model-budget'
assert.equal(nativeOutputTokens(false),6000)
assert.equal(nativeOutputTokens(true),18000)
assert.equal(nativeOutputTokens(true,{ai_native:4000}),4000,'Central model policy limits remain authoritative')
assert.equal(nativeOutputTokens(true,{ai_native:4000,brand_planning:12000}),12000)
assert.equal(nativeOutputTokens(true,{brand_planning:100000}),18000)
assert(fullPlanningScope({stage:'marketing_plan'}));assert(fullPlanningScope({stage:'execution_checklist'}));assert(!fullPlanningScope({stage:'interview'}))
console.log('PASS: full planning output budget, ordinary conversation budget and explicit central policy bounds')
