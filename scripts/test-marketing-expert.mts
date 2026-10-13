import {buildMarketingExpertPrompt} from '../src/lib/brand-plan/marketingExpert.ts'
import {getPromptTemplate,defaultPromptTemplate} from '../src/lib/promptTemplates.ts'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {SkillCatalog} from '@immedi/iaic-core/skills/catalog.js'
import {GET} from '../src/app/api/meta/skills/amc-marketing-expert/route.ts'
const id='amc-marketing-expert/SKILL.md'
const catalog=new SkillCatalog({root:'skills',entries:[id,'amc-brand-planning/SKILL.md']})
const entry=(await catalog.list()).find(v=>v.id===id)!
assert(entry)
const installed=await catalog.read(id,{expectedVersion:entry.version})
assert.equal(installed.text,await readFile('skills/'+id,'utf8'))
await assert.rejects(()=>catalog.read(id,{expectedVersion:'stale'}),/changed/)
await assert.rejects(()=>catalog.read(id,{resource:'../../src/lib/prisma.ts'}),/outside/)
const markdown=await GET(new Request('https://example.invalid/api/meta/skills/amc-marketing-expert'))
assert.equal(await markdown.text(),installed.text)
assert.equal(markdown.headers.get('content-type'),'text/markdown; charset=utf-8')
const zip=await GET(new Request('https://example.invalid/api/meta/skills/amc-marketing-expert?format=zip'))
const bytes=Buffer.from(await zip.arrayBuffer())
assert.deepEqual(bytes,await readFile('public/skills/amc-marketing-expert.zip'))
assert.equal(zip.headers.get('etag'),`"${createHash('sha256').update(bytes).digest('hex')}"`)
assert.equal(zip.headers.get('content-type'),'application/zip')
console.log('PASS: discoverable installed Skill, version pinning, resource scope, downloadable source and archive integrity')

for(const scope of ['annual_strategy','quarter'] as const){
 const result=await buildMarketingExpertPrompt(scope,{merchantInterview:{summary:'只讨论家庭聚餐'},currentQuarter:{months:['2027-01','2027-02','2027-03']}})
 assert(result.prompt.includes(installed.text),'generator must load identical canonical Skill')
 assert.equal(result.trace.skillVersion,createHash('sha256').update(installed.text).digest('hex'))
 assert(result.prompt.includes('只讨论家庭聚餐'))
 assert.equal(result.trace.promptTemplateId,null)
}
assert.equal(defaultPromptTemplate('marketing_plan_generation'),null)
assert.equal(await getPromptTemplate('marketing_plan_generation'),null)
console.log('PASS: both legacy generation stages load canonical Skill; duplicate template retired')
