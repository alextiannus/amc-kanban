// Read repository defaults only: never initialize the server or hydrate database overrides.
import {pathToFileURL} from 'node:url'
import {resolve,join} from 'node:path'
import {readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
const [contentRoot,output]=process.argv.slice(2)
if(!contentRoot||!output)throw Error('Usage: node --import tsx export-content.mjs CONTENT_ROOT OUTPUT.json')
const root=resolve(contentRoot)
const {listAllSkills}=await import(pathToFileURL(join(root,'src/engine/skills/registry.ts')).href)
const {listCopywriterVariants,resolveCopywriterNativeSkillContext}=await import(pathToFileURL(join(root,'src/engine/copywriters/catalog.ts')).href)
const profiles=listCopywriterVariants()
const skills=listAllSkills()
const native=profiles.map(p=>({agentId:p.id,platform:p.platform,skill:p.nativeSkill,
  systemSkills:resolveCopywriterNativeSkillContext(p).skills.filter(s=>s.id!==p.nativeSkill.id)}))
const sources=[]
function collect(folder){
 for(const item of readdirSync(join(root,folder),{withFileTypes:true})){
  const file=folder+'/'+item.name
  if(item.isDirectory())collect(file)
  else if(item.isFile()&&file.endsWith('.ts'))sources.push(file)
 }
}
for(const folder of ['src/engine/skills','src/engine/copywriters','src/engine/platforms','src/engine/verticals'])collect(folder)
sources.sort()
const hashes={}
for(const file of sources){
  hashes[file]=createHash('sha256').update(readFileSync(join(root,file))).digest('hex')
}
writeFileSync(resolve(output),JSON.stringify({schemaVersion:1,source:'amc-content repository defaults; no database overrides',
  compositionRule:'Native Skill plus system anti-AI for current copywriter creation; other registry entries are compatibility/reference capabilities, not automatically active.',
  sourceHashes:hashes,registry:skills,native},null,2)+'\n')
console.log(JSON.stringify({registry:skills.length,native:native.length,output:resolve(output)}))
