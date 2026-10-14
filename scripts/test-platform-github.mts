import assert from 'node:assert/strict'
import {EngineeringGitHub,deployedRevision} from '../src/lib/platform-ai/github.ts'
const base='a'.repeat(40),sha='b'.repeat(40),calls:any[]=[]
let head=base,run:any=null
const github=new EngineeringGitHub({enabled:true,githubToken:'fixture-only'},async(url:any,options:any)=>{
 const path=new URL(url).pathname;calls.push({path,method:options.method,body:options.body?JSON.parse(options.body):null})
 if(path.endsWith('/git/ref/heads/main'))return Response.json({object:{sha:head}})
 if(path.endsWith('/git/refs/heads/main')){const body=JSON.parse(options.body);assert.equal(body.force,false);head=body.sha;return Response.json({object:{sha:head}})}
 if(path.endsWith('/runs'))return Response.json({workflow_runs:run?[run]:[]})
 if(path.endsWith('/jobs'))return Response.json({jobs:[{steps:['Reproduce baseline','Verify patch','Typecheck','Build'].map(name=>({name,conclusion:'success'}))}]})
 if(path.endsWith('/dispatches'))return new Response(null,{status:204})
 return new Response(null,{status:404})
})
const patch={repo:'amc-mm',base,sha,testPath:'scripts/platform-regressions/00000000-0000-0000-0000-000000000000.test.mts'}
await github.publish(patch,false);assert.equal(head,sha);assert.equal(calls.filter(c=>c.method==='PATCH').length,1)
await github.publish(patch,true);assert.equal(calls.filter(c=>c.method==='PATCH').length,1)
head='c'.repeat(40);await assert.rejects(()=>github.publish(patch,false),/main_changed/);await assert.rejects(()=>github.publish(patch,true),/outcome_unknown/)
await github.checks(patch,'test',true);assert.equal(calls.filter(c=>c.path.endsWith('dispatches')).length,1)
await github.checks(patch,'test',false);assert.equal(calls.filter(c=>c.path.endsWith('dispatches')).length,1)
run={display_title:`amc-platform:test:${sha}`,event:'workflow_dispatch',head_branch:'main',head_sha:'c'.repeat(40),status:'completed',conclusion:'success',id:7}
assert.equal((await github.checks(patch,'test',false)).passed,false,'wrong baseline cannot authorize release')
run.head_sha=base;assert.equal((await github.checks(patch,'test',false)).passed,true)
assert.equal((await deployedRevision('amc-mm',sha,async()=>Response.json({commit:base}))).ready,false)
assert.equal((await deployedRevision('amc-mm',sha,async()=>Response.json({commit:sha}))).ready,true)
console.log('PASS GitHub guards: non-force update, no duplicate publish/dispatch after uncertainty, branch conflict, exact workflow baseline and production commit binding; HTTP mocked')
const logRequests:any[]=[]
const logs=new EngineeringGitHub({enabled:true,githubToken:'fixture-only'},async(url:any,options:any)=>{
 logRequests.push({url:String(url),headers:options.headers})
 if(logRequests.length===1)return new Response(null,{status:302,headers:{location:'https://fixture.blob.core.windows.net/log?sig=fixture'}})
 return new Response('AssertionError: expected sanitized receipt')
})
assert.match(await logs.failureLog('amc-mm',1),/AssertionError/)
assert.equal(logRequests[1].headers,undefined,'never forward credentials to the log storage host')
const hostile=new EngineeringGitHub({enabled:true,githubToken:'fixture-only'},async()=>new Response(null,{status:302,headers:{location:'https://untrusted.example/log'}}))
await assert.rejects(()=>hostile.failureLog('amc-mm',1),/host_not_allowed/)
console.log('PASS bounded CI failure logs, redirect host restriction and credential stripping')
