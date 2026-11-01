import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
const catalog=JSON.parse(readFileSync('docs/amc-capability-catalog.json','utf8'))
const manifest=JSON.parse(readFileSync('packages/amc-skills/manifest.json','utf8'))
const skills=new Set(manifest.skills.map(s=>s.id))
const schema=readFileSync('prisma/schema.prisma','utf8')
assert.equal(catalog.features.length,5)
assert.equal(new Set(catalog.features.map(f=>f.id)).size,5)
for(const f of catalog.features){
 for(const key of ['name','page','assistant','mcp','permission','receipt','gap'])assert(f[key]?.trim(),`${f.id}: missing ${key}`)
 for(const p of f.sources)assert(existsSync(p),`missing source ${p}`)
 for(const s of f.skills)assert(skills.has(s),`missing skill ${s}`)
 for(const m of f.assets)assert(schema.includes(`model ${m} {`),`missing asset model ${m}`)
}
console.log('PASS: five features have source paths, real skill IDs, asset models, separate entry points, permissions, receipts and explicit gaps')
