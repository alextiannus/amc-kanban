import {createHash} from 'node:crypto'
export const REPOSITORIES={
  'amc-mm':{owner:'alextiannus',serviceId:'srv-d94hhgtckfvc73a1dla0'},
  'amc-kanban':{owner:'alextiannus',serviceId:'srv-d94hhbt7vvec73dk7uig'},
} as const
export type Repository=keyof typeof REPOSITORIES
export const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function repository(value:string):Repository{if(!(value in REPOSITORIES)||!Object.hasOwn(REPOSITORIES,value))throw Error('repository_not_allowed');return value as Repository}
export function sourcePath(path:string,write=false){
  if(typeof path!=='string'||path.length>240||! /^(src|scripts|docs)\/[A-Za-z0-9_\-./\[\]]+\.(tsx?|mts|mjs|md|css)$/.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw Error('source_path_not_allowed')
  if(write&&(/(?:^|\/)(?:platform-ai|ai-native|global-text|auth[^/]*|model-management|user-management|role-permissions|billing|payments|subscriptions|admin|api)(?:\/|\.)/i.test(path)||/prisma|middleware|instrumentation|proxy|secret|credential|permission|platform-engineering|platform-github|configure-platform/i.test(path)))throw Error('protected_source_path')
  return path
}
export type Patch={repo:Repository;base:string;files:{path:string;content:string}[];test:string}
export function validatePatch(input:Patch,reportId:string){
  repository(input.repo)
  if(!/^[0-9a-f]{40}$/.test(input.base))throw Error('invalid_base_revision')
  if(!Array.isArray(input.files)||!input.files.length||input.files.length>8)throw Error('invalid_patch_files')
  const paths=new Set<string>()
  for(const file of input.files){sourcePath(file.path,true);if(paths.has(file.path)||typeof file.content!=='string'||file.content.length>60000)throw Error('invalid_patch_file');paths.add(file.path)}
  const testPath=`scripts/platform-regressions/${reportId}.test.mts`
  if(paths.has(testPath)||!input.files.some(f=>f.path.startsWith('src/'))||typeof input.test!=='string'||input.test.length>20000||!input.test.includes('node:assert'))throw Error('regression_test_required')
  if(JSON.stringify(input).length>160000)throw Error('patch_too_large')
  // Credentials and report excerpts must never be published in code or CI output.
  if(/(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/.test(JSON.stringify(input)))throw Error('credential_in_patch')
  return {...input,files:[...input.files,{path:testPath,content:input.test}],testPath}
}

export async function expandPatch(input:Patch|any,read:(path:string)=>Promise<string>):Promise<Patch>{
  repository(input.repo)
  if(!/^[0-9a-f]{40}$/.test(input.base)||!Array.isArray(input.files)||input.files.length>8)throw Error('invalid_patch_files')
  const files=[]
  for(const file of input.files){
    sourcePath(file.path,true)
    if(typeof file.content==='string'&&file.edits===undefined){files.push({path:file.path,content:file.content});continue}
    if(file.content!==undefined||!Array.isArray(file.edits)||!file.edits.length||file.edits.length>12)throw Error('invalid_exact_edits')
    let content=await read(file.path)
    for(const edit of file.edits){
      if(typeof edit.before!=='string'||!edit.before||typeof edit.after!=='string'||edit.before.length>12000||edit.after.length>12000)throw Error('invalid_exact_edit')
      const at=content.indexOf(edit.before)
      if(at<0||content.indexOf(edit.before,at+1)>=0)throw Error('edit_must_match_once')
      content=content.slice(0,at)+edit.after+content.slice(at+edit.before.length)
      if(content.length>60000)throw Error('invalid_patch_file')
    }
    files.push({path:file.path,content})
  }
  return {repo:input.repo,base:input.base,files,test:input.test}
}
