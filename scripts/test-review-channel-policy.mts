import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import * as policy from '../src/lib/reviewChannelPolicy.ts'
import { MCP_PERMISSIONS } from '../src/lib/role-permissions/mcp.ts'

let grants = new Set<string>(), active = true, writes = 0, canWrite = true
const callbacks = new Map<string, (...args:any[])=>any>()
class FakeServer { tool(...args:any[]) {callbacks.set(args[0], args.at(-1));return {}} }
const user={id:'user',status:'ACTIVE',authVersion:1}
const principal={userId:'user',authVersion:1,source:'api_key'}
const prisma={user:{findUnique:async()=>active?user:null},brand:{findFirst:async()=>({id:'brand'}),findUnique:async()=>({id:'brand'})}}
function compile(path:string,deps:Record<string,any>,allowUnused=false){
 const mod={exports:{} as any}
 const source=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports',source)((name:string)=>{
  if(name in deps)return deps[name]
  if(allowUnused)return new Proxy({}, {get:()=>()=>{writes++;throw Error('Unexpected dependency execution: '+name)}})
  throw Error('Unexpected dependency: '+name)
 },mod,mod.exports)
 return mod.exports
}
const server=compile('src/lib/partner/mcp/server.ts',{
 '@modelcontextprotocol/sdk/server/mcp.js':{McpServer:FakeServer},'zod':{z},
 '@/lib/prisma':{prisma},'@/lib/auth-v2':{authenticateApiKey:async()=>principal},
 '@/lib/auth-v2/types':{principalFromUser:()=>principal},
 '@/lib/role-permissions/store':{allows:async(_:any,p:string)=>grants.has(p)},
 '@/lib/role-permissions/mcp':{MCP_PERMISSIONS},'@/lib/reviewChannelPolicy':policy,
 '@/lib/user-management/brandAccess':{canUserAccessBrand:async()=>false},
},true)
server.createAmcMcpServer(principal)
const call=async(name:string,input:any)=>callbacks.get(name)!(input)
for(const platform of ['instagram',' TikTok ','FACEBOOK','threads']){
 for(const name of ['board_reply_review','reply_review','postfast_reply_review']){
  grants=new Set(['review.reply']);const r=await call(name,{brandId:'brand',platform,reviewId:'r',replyText:'text'})
  assert.equal(r.isError,true);assert.match(r.content[0].text,/SOCIAL_INBOX_REQUIRED/)
 }
 for(const actionType of ['reply_review','domestic_reply_review']){
  grants=new Set(['action_item.resolve','review.reply']);const r=await call('execute_brand_action',{brandId:'brand',platform,actionType})
  assert.match(r.content[0].text,/SOCIAL_INBOX_REQUIRED/)
 }
}
for(const [actionType,expected] of [['reply_review','review.reply'],['domestic_reply_review','review.reply'],['publish_post','content.publish']]){
 grants=new Set(['action_item.resolve'])
 const r=await call('execute_brand_action',{brandId:'brand',actionType,platform:'google'})
 assert.match(r.content[0].text,new RegExp('Permission denied: '+expected))
 grants.add(expected)
 const allowed=await call('execute_brand_action',{brandId:'brand',actionType,platform:'google'})
 assert.match(allowed.content[0].text,/outside this user permission scope/,'allowed action must still check brand WRITE')
}
grants=new Set(['review.reply']);active=false
assert.match((await call('board_reply_review',{platform:'google'})).content[0].text,/Identity revoked/)
active=true
for(const platform of ['google','yelp','xiaohongshu','dianping','meituan'])assert.equal(policy.requiresSocialInbox(platform),false)
assert.equal(policy.legacyMcpInboxWrite('execute_brand_action',{actionType:'publish_post',platform:'instagram'}),false)
assert.equal(writes,0)

const route=compile('src/app/api/brands/[id]/reviews/route.ts',{
 'next/server':{NextResponse},'@/lib/auth':{getSession:async()=>({user:{...user,type:'HUMAN',role:'USER'}}),extractApiKey:()=>null,getAgentFromApiKey:async()=>null},
 '@/lib/prisma':{prisma},'@/lib/brandAccess':{canSessionAccessBrandProject:async()=>true,canSessionWriteBrandProject:async()=>canWrite},
 '@/lib/reviewChannelPolicy':policy,'@/lib/integrations/google':{},
 '@/lib/integrations/postfast':{postfastReplyReview:async()=>{writes++;throw Error('must not send')}},
})
for(const platform of ['instagram',' TikTok ','facebook','threads']){
 const r=await route.POST(new Request('https://example.test/api/brands/brand/reviews',{method:'POST',body:JSON.stringify({platform,reviewId:'r',replyText:'text'})}),{params:Promise.resolve({id:'brand'})})
 assert.equal(r.status,409);assert.match((await r.json()).error,/SOCIAL_INBOX_REQUIRED/)
}
canWrite=false
const denied=await route.POST(new Request('https://example.test/api/brands/brand/reviews',{method:'POST',body:JSON.stringify({platform:'google',reviewId:'r',replyText:'text'})}),{params:Promise.resolve({id:'brand'})})
assert.equal(denied.status,403);assert.equal(writes,0)
console.log('PASS: actual MCP registrations/aliases and legacy HTTP reject inbox bypass; compound action permissions, revocation and brand WRITE remain enforced; no provider call')
