const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../src/lib/activityPreviewOrigin.ts'), 'utf8')
const moduleUnderTest = {exports:{}}
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleUnderTest,moduleUnderTest.exports)
const allowed = moduleUnderTest.exports.isActivityPreviewOrigin
for (const merchant of ['https://amc-mm.immedi.ai','https://amc-kanban.immedi.ai','https://amc.immedi.ai']) assert.equal(allowed(merchant,'https://amc.immedi.ai'),true)
for (const foreign of ['null','https://evil.example','https://amc-kanban.immedi.ai.evil.example','http://amc-kanban.immedi.ai','https://amc-kanban.immedi.ai:444','https://amc-mm.immedi.ai@evil.example']) assert.equal(allowed(foreign,'https://amc.immedi.ai'),false)
console.log('PASS both merchant origins, same-origin preview, foreign origins, scheme/port changes and host confusion.')
