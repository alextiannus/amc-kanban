import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {applicationVersion} from '../src/lib/ai-native/application.ts'
const root=await mkdtemp(path.join(tmpdir(),'amc-version-'))
try{
 const source=await readFile('src/lib/ai-native/application.ts','utf8')
 const files=new Set([...source.matchAll(/'((?:src|skills)\/[^']+\.(?:ts|mjs|md))'/g)].map(m=>m[1]))
 for(const file of [...files,'src/lib/ai-native/strategy-document.ts','src/lib/ai-native/latest-preview.ts']){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),await readFile(file))}
 const base=await applicationVersion(root)
 for(const file of ['src/lib/ai-native/strategy-document.ts','src/lib/ai-native/latest-preview.ts']){const original=await readFile(path.join(root,file),'utf8');await writeFile(path.join(root,file),original+'\n// Changed implementation\n');assert.notEqual(await applicationVersion(root),base,file+' must change runtime deployment version');await writeFile(path.join(root,file),original);assert.equal(await applicationVersion(root),base)}
 console.log('PASS: strategy adapter and preview implementation changes independently invalidate runtime version')
}finally{await rm(root,{recursive:true,force:true})}
