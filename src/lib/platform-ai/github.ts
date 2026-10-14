import {REPOSITORIES,repository,sourcePath,validatePatch,type Patch,type Repository} from './engineering-policy'
import type {EngineeringConfig} from './engineering-store'

export class EngineeringGitHub {
  constructor(private config:EngineeringConfig,private fetcher:typeof fetch=fetch){}
  async api(repo:Repository,path:string,method='GET',body?:unknown){
    repository(repo)
    const response=await this.fetcher(`https://api.github.com/repos/${REPOSITORIES[repo].owner}/${repo}/${path}`,{method,headers:{Authorization:`Bearer ${this.config.githubToken}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'})
    if(!response.ok)throw Object.assign(Error(`github_${response.status}`),{status:response.status})
    return response.status===204?null:response.json()
  }
  async head(repo:Repository){return (await this.api(repo,'git/ref/heads/main')).object.sha as string}
  async source(repo:Repository,ref:string,path:string){
    if(!/^[0-9a-f]{40}$/.test(ref))throw Error('immutable_revision_required')
    sourcePath(path)
    const file=await this.api(repo,`contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`)
    if(file.type!=='file'||file.encoding!=='base64'||file.size>100000)throw Error('source_unavailable')
    return {path,ref,content:Buffer.from(file.content,'base64').toString('utf8')}
  }
  async tree(repo:Repository,ref:string){
    if(!/^[0-9a-f]{40}$/.test(ref))throw Error('immutable_revision_required')
    const result=await this.api(repo,`git/trees/${ref}?recursive=1`)
    if(result.truncated)throw Error('repository_tree_truncated')
    return result.tree.filter((file:any)=>{try{sourcePath(file.path);return file.type==='blob'&&file.mode==='100644'}catch{return false}}).map((file:any)=>file.path)
  }
  async patch(reportId:string,id:string,input:Patch,recover:boolean){
    const patch=validatePatch(input,reportId),branch=`amc-platform/${reportId}/${id}`
    try{
      const found=await this.api(patch.repo,`git/ref/heads/${branch}`)
      return {repo:patch.repo,base:patch.base,sha:found.object.sha,branch,testPath:patch.testPath}
    }catch(error){if((error as {status?:number}).status!==404)throw error}
    if(recover)throw Error('patch_outcome_unknown')
    const base=await this.api(patch.repo,`git/commits/${patch.base}`)
    const tree=await this.api(patch.repo,'git/trees','POST',{base_tree:base.tree.sha,tree:patch.files.map(file=>({path:file.path,mode:'100644',type:'blob',content:file.content}))})
    const commit=await this.api(patch.repo,'git/commits','POST',{message:`Platform maintenance ${reportId}`,tree:tree.sha,parents:[patch.base]})
    await this.api(patch.repo,'git/refs','POST',{ref:`refs/heads/${branch}`,sha:commit.sha})
    return {repo:patch.repo,base:patch.base,sha:commit.sha,branch,testPath:patch.testPath}
  }
  async checks(patch:any,id:string,dispatch:boolean){
    const title=`amc-platform:${id}:${patch.sha}`
    const runs=await this.api(patch.repo,'actions/workflows/platform-engineering.yml/runs?event=workflow_dispatch&per_page=100')
    const found=runs.workflow_runs.find((run:any)=>run.display_title===title&&run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.head_sha===patch.base)
    if(found){
      const jobs=await this.api(patch.repo,`actions/runs/${found.id}/jobs?per_page=100`)
      const steps=jobs.jobs.flatMap((job:any)=>job.steps||[])
      const passed=found.conclusion==='success'&&['Reproduce baseline','Verify patch','Typecheck','Build'].every(name=>steps.some((step:any)=>step.name===name&&step.conclusion==='success'))
      let failureLog:string|null=null
      const failed=jobs.jobs.find((job:any)=>job.conclusion==='failure')
      if(failed&&Number.isSafeInteger(failed.id))try{failureLog=await this.failureLog(patch.repo,failed.id)}catch{/* A missing log never converts a failed check into a pass. */}
      return {ready:found.status==='completed',passed,runId:found.id,sha:patch.sha,conclusion:found.conclusion,url:found.html_url,steps:steps.map((step:any)=>({name:step.name,conclusion:step.conclusion})),failureLog}
    }
    if(dispatch)await this.api(patch.repo,'actions/workflows/platform-engineering.yml/dispatches','POST',{ref:'main',inputs:{operation:id,base:patch.base,candidate:patch.sha,test:patch.testPath}})
    return {ready:false,passed:false,sha:patch.sha,runId:null}
  }
  async failureLog(repo:Repository,jobId:number){
    const response=await this.fetcher(`https://api.github.com/repos/${REPOSITORIES[repo].owner}/${repo}/actions/jobs/${jobId}/logs`,{headers:{Authorization:`Bearer ${this.config.githubToken}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000),redirect:'manual'})
    if(response.status!==302)throw Error('ci_log_unavailable')
    const url=new URL(response.headers.get('location')||'')
    if(url.protocol!=='https:'||url.username||url.password||!(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com')))throw Error('ci_log_host_not_allowed')
    // Credentials never follow the redirect. Read a bounded tail; signed URLs are not exposed.
    const log=await this.fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error'})
    if(!log.ok||!log.body)throw Error('ci_log_unavailable')
    const reader=log.body.getReader(),decoder=new TextDecoder();let size=0,tail=''
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;tail=(tail+decoder.decode(chunk.value,{stream:true})).slice(-16000);if(size>1000000)break}}finally{await reader.cancel()}
    return tail.replace(/(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})/g,'[redacted]')
  }
  async publish(patch:any,recover:boolean){
    const head=await this.head(patch.repo)
    if(head===patch.sha)return {sha:patch.sha,repo:patch.repo,pushed:true}
    if(recover)throw Error('publish_outcome_unknown')
    if(head!==patch.base)throw Error('main_changed_rebase_required')
    await this.api(patch.repo,'git/refs/heads/main','PATCH',{sha:patch.sha,force:false})
    if(await this.head(patch.repo)!==patch.sha)throw Error('publish_verification_pending')
    return {sha:patch.sha,repo:patch.repo,pushed:true}
  }
}

export async function deployedRevision(repo:Repository,sha:string,fetcher:typeof fetch=fetch){
  const origin=repo==='amc-mm'?'https://amc-mm.immedi.ai':'https://amc-kanban.immedi.ai'
  const response=await fetcher(`${origin}/api/health${repo==='amc-kanban'?'/version':''}`,{cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!response.ok)return {ready:false,sha}
  const value=await response.json()
  const commit=value.commit||value.gitCommit||value.commitSha
  if(commit!==sha)return {ready:false,sha}
  const home=await fetcher(origin,{cache:'no-store',signal:AbortSignal.timeout(15000)})
  return {ready:home.ok,sha,origin}
}
