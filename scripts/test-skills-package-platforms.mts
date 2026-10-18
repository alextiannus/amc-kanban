import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {loadPlatformSkill} from '../src/agents/skills/skillLoader.ts'
const manifest=JSON.parse(await readFile('packages/amc-skills/manifest.json','utf8'))
for(const entry of manifest.mirrors.filter((entry:any)=>entry.platformLegacy)){
 const expected=entry.platformLegacy
 const loaded=await loadPlatformSkill(expected.platform)
 assert(loaded)
 assert.equal(loaded.version,expected.version)
 assert.equal(loaded.platform,expected.platform)
 assert.equal(loaded.language,expected.language)
 const canonical=await readFile('packages/amc-skills/'+entry.source,'utf8')
 assert.equal(loaded.instructions,canonical.split('\n---\n').slice(1).join('\n---\n'))
}
assert.equal((await loadPlatformSkill('red'))?.platform,'xiaohongshu')
assert.equal((await loadPlatformSkill('gbp'))?.platform,'google_business')
console.log('PASS: all five legacy platform loaders retain canonical instructions, metadata and aliases')
