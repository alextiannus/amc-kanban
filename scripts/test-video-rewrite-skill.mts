import assert from 'node:assert/strict'
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadVideoRewriteSkill} from '../src/lib/videoRewriteSkill'
const root=await mkdtemp(path.join(tmpdir(),'amc-rewrite-skill-'))
try {
 const actual=await loadVideoRewriteSkill()
 await mkdir(path.join(root,'skills/amc-creative/references'),{recursive:true})
 for(const module of actual.modules){
  const text=await readFile('skills/amc-creative/'+module.resource,'utf8')
  await writeFile(path.join(root,'skills/amc-creative',module.resource),text)
  assert.equal(module.version,'sha256:'+createHash('sha256').update(text).digest('hex'))
 }
 assert.deepEqual(await loadVideoRewriteSkill(root),actual)
 const camera=path.join(root,'skills/amc-creative/references/video-camera.md')
 await writeFile(camera,'Changed camera instructions')
 const changed=await loadVideoRewriteSkill(root)
 assert.notEqual(changed.version,actual.version)
 assert.notEqual(changed.modules[2].version,actual.modules[2].version)
 assert.equal(changed.modules[1].version,actual.modules[1].version)
 await writeFile(camera,'  ')
 await assert.rejects(loadVideoRewriteSkill(root),/video_rewrite_skill_unavailable/)
 await rm(camera)
 await assert.rejects(loadVideoRewriteSkill(root),/ENOENT/)
 await writeFile(camera,'Restored camera module')
 assert((await loadVideoRewriteSkill(root)).text.includes('Restored camera module'))
 console.log('PASS module provenance, deterministic bundle, revision sensitivity, missing/blank fail closed and restored resource recovery')
} finally {await rm(root,{recursive:true,force:true})}
