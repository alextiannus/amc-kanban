import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PrismaClient} from '@prisma/client'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {LarkProvider,LarkError,documentId,plainText,textBlock} from '../src/lib/lark-documents/provider'
import {LarkStore,unseal,type LarkTokens} from '../src/lib/lark-documents/store'
import {createLarkService} from '../src/lib/lark-documents/service'
import {registerLarkTools} from '../src/lib/lark-documents/tools'
import {businessReceipts} from '../src/lib/ai-native/business-receipt'
import {larkHttp} from '../src/lib/lark-documents/http'

// Refuse arbitrary databases: this test only operates the isolated, temporary local fixture.
const url=process.env.LARK_TEST_DATABASE_URL
if(!url||!/^postgresql:\/\/[^@]+@127\.0\.0\.1:55486\/lark_fixture(?:\?|$)/.test(url))throw Error('Set LARK_TEST_DATABASE_URL to the isolated localhost:55486/lark_fixture database')
process.env.MODEL_CONFIG_ENCRYPTION_KEY='7a'.repeat(32)
const db=new PrismaClient({datasources:{db:{url}}}),db2=new PrismaClient({datasources:{db:{url}}})
let checks=0
const check=(name:string)=>{checks++;console.log('PASS '+name)}
try{
  await db.$executeRawUnsafe('DROP TABLE IF EXISTS "LarkOAuthState","LarkUserConnection","AuditLog","User","Brand" CASCADE')
  await db.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY)')
  await db.$executeRawUnsafe('CREATE TABLE "Brand" ("id" TEXT PRIMARY KEY)')
  await db.$executeRawUnsafe('CREATE TABLE "AuditLog" ("id" TEXT PRIMARY KEY,"timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"actorId" TEXT,"actorType" TEXT NOT NULL DEFAULT \'SYSTEM\',"actorName" TEXT,"action" TEXT NOT NULL,"resourceId" TEXT NOT NULL,"resourceType" TEXT NOT NULL DEFAULT \'WorkUnit\',"oldValue" JSONB,"newValue" JSONB,"reason" TEXT,"metadata" JSONB)')
  for(const statement of (await readFile(new URL('../prisma/migrations/202611260001_lark_personal_documents/migration.sql',import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await db.$executeRawUnsafe(statement)
  await db.$executeRawUnsafe('INSERT INTO "User" VALUES (\'alice\'),(\'bob\')')
  await db.$executeRawUnsafe('INSERT INTO "Brand" VALUES (\'brandA\'),(\'brandB\')')
  const store=new LarkStore(db),store2=new LarkStore(db2)
  const actor={userId:'alice',authVersion:1},bob={userId:'bob',authVersion:1}
  let activeVersion=1,refreshes=0,creates=0,appends=0,updates=0,failAfterWrite=false,failReadback=false,blockStyle=false
  const docs=new Map<string,{title:string;revision:number;blocks:any[]}>()
  const provider=new LarkProvider(async(raw,init)=>{
    const url=new URL(String(raw)),path=url.pathname.replace('/open-apis',''),body=init?.body?JSON.parse(String(init.body)):{}
    assert.equal(url.origin,'https://open.larksuite.com');assert.equal(init?.redirect,'error')
    const reply=(data:any)=>Response.json({code:0,data})
    if(path==='/authen/v2/oauth/token'){
      assert.equal(body.client_id,'cli_larkfixture');assert.equal(body.client_secret,'fixture-app-secret')
      if(body.grant_type==='refresh_token'){refreshes++;await new Promise(r=>setTimeout(r,30))}
      else {assert.equal(body.code,'fixture-code');assert.equal(body.redirect_uri,'https://amc-mm.immedi.ai/lark/callback');assert.equal(body.code_verifier.length,43)}
      return Response.json({code:0,access_token:'personal-fixture-token',refresh_token:'personal-fixture-refresh-'+refreshes,expires_in:7200,refresh_token_expires_in:86400,scope:'offline_access docx:document search:docs:read'})
    }
    assert.equal((init?.headers as any).Authorization,'Bearer personal-fixture-token')
    if(path==='/authen/v1/user_info')return reply({open_id:'ou_fixture_alice',name:'Alice'})
    if(path==='/search/v2/doc_wiki/search'){
      assert.deepEqual(body.doc_filter,{doc_types:['DOCX']});assert.equal(body.page_size,20)
      return reply({res_units:[{title_highlighted:'fixture',result_meta:{url:'https://tenant.larksuite.com/docx/docCreated1',doc_types:['DOCX']}}],has_more:!body.page_token,page_token:body.page_token?'':'next-page'})
    }
    if(path==='/docx/v1/documents'&&init?.method==='POST'){
      creates++;const id='docCreated'+creates;docs.set(id,{title:body.title,revision:1,blocks:[]})
      if(failAfterWrite)throw Error('network uncertainty with sensitive body that must not leak')
      return reply({document:{document_id:id}})
    }
    const match=path.match(/^\/docx\/v1\/documents\/(\w+)(.*)$/);assert.ok(match,'unexpected provider path '+path)
    const [,id,tail]=match!,doc=docs.get(id);assert.ok(doc)
    if(!tail){if(failReadback)throw Error('read unavailable');return reply({document:{document_id:id,title:doc!.title,revision_id:doc!.revision}})}
    if(tail==='/blocks')return reply({items:doc!.blocks,has_more:false})
    if(tail.endsWith('/children')){
      assert.equal(Number(url.searchParams.get('document_revision_id')),doc!.revision)
      assert.equal(body.children.length,1);assert.equal(body.index,-1);appends++
      const block={block_id:'blockText'+appends,...body.children[0]};doc!.blocks.push(block);doc!.revision++
      return reply({children:[block]})
    }
    const blockId=tail.split('/')[2],block=doc!.blocks.find(b=>b.block_id===blockId);assert.ok(block)
    assert.equal(Number(url.searchParams.get('document_revision_id')),doc!.revision)
    if(init?.method==='PATCH'){updates++;assert.deepEqual(Object.keys(body),['update_text_elements']);block.text.elements=body.update_text_elements.elements;doc!.revision++;return reply({block})}
    if(blockStyle)return reply({block:{...block,text:{elements:[{text_run:{content:'linked',text_element_style:{link:{url:'https://example.com'}}}}]}}})
    return reply({block})
  })
  const authorize=async(a:any,brandId:string)=>{if(a.authVersion!==activeVersion)throw new LarkError('AUTH_REVOKED',401);if(brandId!=='brandA')throw new LarkError('LARK_BRAND_ACCESS_DENIED',403)}
  const service=createLarkService({store,provider,authorize,app:async()=>({appId:'cli_larkfixture',appSecret:'fixture-app-secret'})})
  assert.equal(documentId('https://tenant.larksuite.com/docx/docCreated1?from=chat'),'docCreated1')
  for(const value of ['https://larksuite.com.evil.test/docx/docCreated1','http://tenant.larksuite.com/docx/docCreated1','https://user:pass@tenant.larksuite.com/docx/docCreated1','https://tenant.larksuite.com/wiki/docCreated1'])assert.throws(()=>documentId(value))
  check('Docx links validate scheme, domain, resource kind and credentials')
  const auth=await service.start(actor,'brandA','https://amc-mm.immedi.ai'),state=new URL(auth.authorizationUrl).searchParams.get('state')!
  assert.equal(new URL(auth.authorizationUrl).searchParams.get('code_challenge_method'),'S256')
  assert.equal(new URL(auth.authorizationUrl).searchParams.get('scope'),'offline_access docx:document search:docs:read')
  await assert.rejects(store.consume(bob,'brandA',state),/EXPIRED_OR_USED/)
  await assert.rejects(store.consume({...actor,authVersion:2},'brandA',state),/EXPIRED_OR_USED/)
  await service.callback(actor,'brandA',state,'fixture-code','https://amc-mm.immedi.ai')
  await assert.rejects(service.callback(actor,'brandA',state,'fixture-code','https://amc-mm.immedi.ai'),/EXPIRED_OR_USED/)
  check('OAuth PKCE, user/authVersion binding and replay rejection')
  const row=await store.connection('alice','brandA');assert.ok(row);assert.ok(!row!.tokenCipher.includes('personal-fixture'))
  assert.throws(()=>unseal('bob','brandA',row!.tokenCipher),/BINDING_INVALID/)
  assert.equal((await service.status(actor,'brandA')).account,'Alice')
  assert.equal((await service.status(bob,'brandA')).connected,false)
  await assert.rejects(service.call(bob,'lark_search_documents',{brandId:'brandA',query:''}),/CONNECT_REQUIRED/)
  await assert.rejects(service.call(actor,'lark_search_documents',{brandId:'brandB',query:''}),/ACCESS_DENIED/)
  check('Encrypted tokens and personal/brand isolation without tenant fallback')
  const serialized=JSON.stringify(await service.status(actor,'brandA'));assert.ok(!serialized.includes('token')&&!serialized.includes('secret'))
  const first=await service.call(actor,'lark_search_documents',{brandId:'brandA',query:'计划'});assert.equal(first.hasMore,true)
  const second=await service.call(actor,'lark_search_documents',{brandId:'brandA',query:'计划',pageToken:first.pageToken});assert.equal(second.hasMore,false)
  check('Search sends official DOCX filter and preserves continuation')
  const created:any=await service.call(actor,'lark_create_document',{brandId:'brandA',title:'Fixture document',text:'original',requestKey:'create-0001'})
  assert.equal(created.state,'verified');assert.equal(creates,1);assert.equal(appends,1)
  const reused:any=await service.call(actor,'lark_create_document',{brandId:'brandA',title:'Fixture document',text:'original',requestKey:'create-0001'});assert.deepEqual(reused,created);assert.equal(creates,1)
  await assert.rejects(service.call(actor,'lark_create_document',{brandId:'brandA',title:'changed',requestKey:'create-0001'}),/KEY_REUSED/)
  check('Create plus initial content is read back; duplicate request is not re-executed')
  const read:any=await service.call(actor,'lark_read_document',{brandId:'brandA',document:created.documentId});assert.equal(read.blocks[0].text,'original');assert.equal(read.revision,2)
  docs.get(created.documentId)!.blocks.push({block_id:'blockImage1',block_type:27,image:{token:'unrelated-media'}})
  const updated:any=await service.call(actor,'lark_update_document_block',{brandId:'brandA',document:created.documentId,blockId:created.blockId,expectedRevision:read.revision,text:'revised',requestKey:'update-0001'})
  assert.equal(updated.verified,true);assert.equal(updates,1);assert.equal(docs.get(created.documentId)!.blocks[1].image.token,'unrelated-media')
  const conflict:any=await service.call(actor,'lark_append_document',{brandId:'brandA',document:created.documentId,expectedRevision:read.revision,text:'conflict',requestKey:'append-conflict'})
  assert.equal(conflict.state,'rejected');assert.equal(conflict.error,'LARK_DOCUMENT_REVISION_CHANGED');assert.equal(appends,1)
  check('Update changes only specified text block; stale revision rejects without mutation')
  blockStyle=true
  const styled:any=await service.call(actor,'lark_update_document_block',{brandId:'brandA',document:created.documentId,blockId:created.blockId,expectedRevision:updated.revision,text:'destroy formatting',requestKey:'update-styled'})
  assert.equal(styled.state,'rejected');assert.equal(updates,1);blockStyle=false
  check('Rich text links/styles are preserved by refusing destructive text replacement')
  const append:any=await service.call(actor,'lark_append_document',{brandId:'brandA',document:created.documentId,expectedRevision:updated.revision,text:'next paragraph',requestKey:'append-0001'})
  assert.equal(append.state,'verified');assert.equal(appends,2)
  check('Append uses current revision and verifies original block contents')
  await assert.rejects(service.call(actor,'lark_read_document',{brandId:'brandA',document:created.documentId,pageToken:'next-page'}),/PAGE_REVISION_REQUIRED/)
  await assert.rejects(service.call(actor,'lark_read_document',{brandId:'brandA',document:created.documentId,pageToken:'next-page',revision:read.revision}),/REVISION_CHANGED/)
  check('Document pagination requires the original revision and refuses changed documents')
  failAfterWrite=true
  const unknown:any=await service.call(actor,'lark_create_document',{brandId:'brandA',title:'Unknown accepted document',requestKey:'create-unknown'})
  assert.equal(unknown.state,'outcome_unknown');const before=creates
  await service.call(actor,'lark_create_document',{brandId:'brandA',title:'Unknown accepted document',requestKey:'create-unknown'});assert.equal(creates,before);failAfterWrite=false
  check('Lost provider response is retained as unknown; same request never repeats a write')
  failReadback=true
  const unread:any=await service.call(actor,'lark_create_document',{brandId:'brandA',title:'Accepted without readback',requestKey:'create-readback'})
  assert.equal(unread.state,'readback_unavailable');assert.equal(unread.verified,false);assert.ok(unread.documentId);failReadback=false
  check('Accepted write with unavailable readback is not reported as verified')
  let executions=0
  const concurrent=await Promise.all([store.write(actor,'brandA','concurrent-key',{one:1},async()=>{executions++;await new Promise(r=>setTimeout(r,50));return {state:'verified',verified:true}}),store2.write(actor,'brandA','concurrent-key',{one:1},async()=>{executions++;return {state:'verified',verified:true}})])
  assert.equal(executions,1);assert.ok(concurrent.some(v=>v.state==='verified'))
  check('Two database clients reserve concurrent writes exactly once')
  await db.$executeRaw`UPDATE "LarkUserConnection" SET "expiresAt"=NOW()-INTERVAL '1 minute' WHERE "userId"='alice'`
  const refresh=async(old:LarkTokens)=>{const result=await provider.token({appId:'cli_larkfixture',appSecret:'fixture-app-secret'},{grant_type:'refresh_token',refresh_token:old.refreshToken!});return {tokens:{accessToken:result.access_token,refreshToken:result.refresh_token,scope:result.scope},expiresAt:new Date(Date.now()+7200000)}}
  await Promise.all([store.token(actor,'brandA','cli_larkfixture',refresh),store2.token(actor,'brandA','cli_larkfixture',refresh)])
  assert.equal(refreshes,1)
  check('Single-use refresh tokens rotate once across independent workers')
  const server=new McpServer({name:'lark-fixture',version:'1.0.0'}),client=new Client({name:'fixture-client',version:'1.0.0'}),pair=InMemoryTransport.createLinkedPair()
  let currentActor:any=actor
  registerLarkTools(server,async()=>currentActor,service)
  await server.connect(pair[1]);await client.connect(pair[0])
  const catalog=await client.listTools();assert.equal(catalog.tools.length,6)
  const result=await client.callTool({name:'lark_read_document',arguments:{brandId:'brandA',document:created.documentId}}) as any
  assert.equal(JSON.parse(result.content[0].text).blocks[0].text,'revised')
  const invalid=await client.callTool({name:'lark_search_documents',arguments:{brandId:'brandA',query:'a'.repeat(31)}}) as any;assert.equal(invalid.isError,true)
  currentActor=bob
  const isolated=await client.callTool({name:'lark_read_document',arguments:{brandId:'brandA',document:created.documentId}}) as any;assert.equal(isolated.isError,true)
  currentActor=actor;activeVersion=2
  const revoked=await client.callTool({name:'lark_read_document',arguments:{brandId:'brandA',document:created.documentId}}) as any;assert.equal(JSON.parse(revoked.content[0].text).error,'AUTH_REVOKED');activeVersion=1
  await client.close();await server.close()
  check('Actual MCP transport lists/calls tools and enforces input, personal identity and revocation')
  const principal:any={...actor,source:'session'}
  const req=(origin:string,method='POST',body:any={brandId:'brandA'})=>new Request('https://amc-mm.immedi.ai/api/integrations/lark/documents',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await larkHttp(req('https://amc-mm.immedi.ai'),null,service)).status,401)
  assert.equal((await larkHttp(req('https://amc-mm.immedi.ai'),{...principal,source:'api_key'},service)).status,403)
  assert.equal((await larkHttp(req('https://evil.example'),principal,service)).status,403)
  assert.equal((await larkHttp(req('https://amc-mm.immedi.ai','POST',{}),principal,service)).status,422)
  check('Connection management rejects anonymous, API-key and cross-origin requests')
  const pending=await service.start(actor,'brandA','https://amc-mm.immedi.ai'),nonce=new URL(pending.authorizationUrl).searchParams.get('state')!
  const consumed=await store.consume(actor,'brandA',nonce)
  await service.disconnect(actor,'brandA')
  await assert.rejects(store.finish(actor,consumed,{open_id:'ou_fixture'}, {accessToken:'private',scope:''},new Date(Date.now()+60000)),/CANCELLED/)
  assert.equal((await service.status(actor,'brandA')).connected,false)
  check('Disconnect clears tokens and prevents in-flight OAuth callback resurrection')
  const expiring=await service.start(actor,'brandA','https://amc-mm.immedi.ai'),expiredNonce=new URL(expiring.authorizationUrl).searchParams.get('state')!
  await db.$executeRaw`UPDATE "LarkOAuthState" SET "expiresAt"=NOW()-INTERVAL '1 minute'`
  await assert.rejects(store.consume(actor,'brandA',expiredNonce),/EXPIRED_OR_USED/)
  check('Expired authorization state is rejected')
  const audits=await db.auditLog.findMany(),safe=JSON.stringify(audits)
  for(const secret of ['personal-fixture-token','fixture-app-secret','personal-fixture-refresh','"text":"original"','"text":"revised"','next paragraph'])assert.ok(!safe.includes(secret))
  check('Audit receipts contain no provider secrets or document body')
  for(const [state,verified,expected] of [['verified',true,'saved'],['readback_unavailable',false,'unknown'],['outcome_unknown',false,'unknown'],['rejected',false,'failed']] as const){
    const result={tool:'lark_create_document',result:{content:[{type:'text',text:JSON.stringify({state,verified,documentId:'docCreated1',url:'https://www.larksuite.com/docx/docCreated1'})}]}}
    const receipt=businessReceipts([{capability:'amc.business.write',status:'succeeded',result}])[0]
    assert.equal(receipt.state,expected);assert.equal(receipt.documentId,'docCreated1')
  }
  const malformed=new LarkProvider(async()=>Response.json({data:{}}))
  await assert.rejects(malformed.search('fixture','x'),/INVALID_RESPONSE/)
  const denied=new LarkProvider(async()=>Response.json({code:99991671,msg:'sensitive token should not leak'},{status:401}))
  await assert.rejects(denied.search('fixture','x'),error=>error instanceof Error&&error.message==='LARK_API_99991671')
  check('Mechanical receipts preserve original links and unknown states; malformed/denied reads are not empty results')
  console.log(`Completed ${checks} Lark integration checks with actual PostgreSQL and MCP transport. No real Lark account or file was used.`)
}finally{await db.$disconnect();await db2.$disconnect()}
