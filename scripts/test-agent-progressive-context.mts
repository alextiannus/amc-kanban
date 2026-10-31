import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {SkillCatalog} from '@immedi/iaic-core'
import {createAmcContextAssembler} from '../src/lib/ai-native/runtime-application.mjs'
import {buildContextManifest} from '../src/lib/ai-native/context-manifest'

const root=await mkdtemp(path.join(tmpdir(),'amc-progressive-'))
try {
  const selected='video/SKILL.md', unrelated='sales/SKILL.md'
  const body=(name:string,marker:string)=>`---\nname: ${name}\ndescription: ${name} tasks\n---\n${marker}`
  for(const [name,marker] of [['video','PRIVATE_VIDEO_RULE'],['sales','UNSELECTED_SALES_RULE']]){
    await mkdir(path.join(root,name));await writeFile(path.join(root,name,'SKILL.md'),body(name,marker))
  }
  await writeFile(path.join(root,'video','camera.md'),'PRIVATE_CAMERA_RULE')
  const catalog=new SkillCatalog({root,entries:[selected,unrelated]})
  let authorized=true
  const target={authorize:async()=>authorized,revalidate:async(input:any,result:any)=>catalog.read(input.id,{resource:input.resource??null,expectedVersion:result.skillVersion,expectedResourceVersion:result.version})}
  const assembler=createAmcContextAssembler({skillRoot:root,skillCatalog:catalog})
  const input:any={task:{input:{goal:'Rewrite video'}},capability:{implementation:{skillMode:'progressive',skills:[selected,unrelated],instructions:'Use relevant skills.'}},actor:{},history:{calls:[],events:[]},dispatcher:{capabilities:new Map([['assistant.skills.read',target]])}}
  const first=await assembler.assemble(input)
  assert(!JSON.stringify(first).includes('PRIVATE_VIDEO_RULE'))
  assert(!JSON.stringify(first).includes('UNSELECTED_SALES_RULE'))
  const initial=buildContextManifest(first,[])
  assert.equal(initial.directories[0].entries,2)
  assert.equal(initial.directories[0].containsBody,false)
  assert.equal(initial.skillResources.length,0)
  const result=await catalog.read(selected)
  const call={id:'read-main',capability:'assistant.skills.read',input:{id:selected},status:'succeeded',result}
  input.history={calls:[call],events:[{seq:1,kind:'call_settled',data:{callId:call.id}}]}
  const loaded=await assembler.assemble(input)
  assert(JSON.stringify(loaded).includes('PRIVATE_VIDEO_RULE'))
  assert(!JSON.stringify(loaded).includes('PRIVATE_CAMERA_RULE'))
  assert(!JSON.stringify(loaded).includes('UNSELECTED_SALES_RULE'))
  const manifest=buildContextManifest(loaded,[{name:'tool',description:'SECRET_TOOL_DESCRIPTION'}])
  assert.equal(manifest.skillResources[0].included,true)
  assert.equal(manifest.skillResources[0].version,result.version)
  assert(!JSON.stringify(manifest).includes('PRIVATE_VIDEO_RULE'))
  assert(!JSON.stringify(manifest).includes('SECRET_TOOL_DESCRIPTION'))
  const clone=JSON.stringify(loaded);buildContextManifest(loaded,[]);assert.equal(JSON.stringify(loaded),clone)
  assert.notEqual(manifest.input.sha256,initial.input.sha256)
  const repeated={...input,history:{calls:[call,{...call,id:'read-again'}],events:[]}}
  const deduped=await assembler.assemble(repeated)
  assert.equal(JSON.stringify(deduped).split('PRIVATE_VIDEO_RULE').length-1,1)
  assert.equal(input.history.calls[0].result.text,result.text,'durable receipt is unchanged')
  authorized=false
  await assert.rejects(()=>assembler.assemble(input),/no longer authorized/)
  authorized=true
  await writeFile(path.join(root,'video','SKILL.md'),body('video','CHANGED_RULE'))
  await assert.rejects(()=>assembler.assemble(input),/Skill changed/)
  const omitted=buildContextManifest([{role:'user',content:JSON.stringify({calls:[{...call,result:null,resultOmitted:true}]})}],[])
  assert.equal(omitted.skillResources[0].included,false)
  assert.equal(omitted.skillResources[0].content,null)
  const legacy=buildContextManifest([{role:'user',content:JSON.stringify({skills:[{text:'SECRET'}],calls:[{result:{planningContext:{skill:{content:'SECRET'}}}}]})}],[])
  assert.equal(legacy.directories[0].containsBody,true)
  assert.equal(legacy.preloadedPlanningSkills,1)
  assert(!JSON.stringify(legacy).includes('SECRET'))
  console.log('PASS: real Core progressive discovery, selected-only inclusion, revocation, version conflict; manifest privacy, omission, legacy bypass detection and immutable inputs')
}finally{await rm(root,{recursive:true,force:true})}
