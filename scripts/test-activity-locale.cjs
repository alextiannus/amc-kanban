const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/app/game/[brandId]/CustomerGameClient.tsx'), 'utf8')
const ast = ts.createSourceFile('CustomerGameClient.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const detector = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'detectLocale')
assert.ok(detector)
const js = ts.transpileModule(detector.getText(ast), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
const run = input => new Function('window', js + '\nreturn detectLocale()')(input)
assert.equal(run(undefined), 'en', 'Server rendering has a safe default')
for (const [languages, language, expected] of [
  [['zh-CN','en-US'], 'en-US', 'zh'],
  [['en-SG','zh-CN'], 'zh-CN', 'en'],
  [['fr-FR','zh-HK'], 'fr-FR', 'zh'],
  [['fr-FR'], 'fr-FR', 'en'],
  [[], 'zh-TW', 'zh'],
  [[], '', 'en'],
]) assert.equal(run({navigator:{languages,language}}), expected)
console.log('PASS activity language: ordered phone preferences, Chinese variants, English, unsupported-language fallback and safe SSR default.')
