import assert from 'node:assert/strict'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {registerVideoTools,VIDEO_TOOLS} from '../src/lib/video-assistant/tools.ts'
import {createVideoAssistant} from '../src/lib/video-assistant/core.ts'
let actor:any={userId:'u1'},dispatch=0
const service=createVideoAssistant({now:()=>Date.now(),origin:'https://amc.example',authorize:async()=>{},content:async(_a,m,p,b)=>{dispatch++;assert.equal(m,'GET');return {id:'p1',brandId:'b1',createdBy:'u1',status:'processing',progress:{stage:'video_generation',percent:30},shots:[]}},reserve:async()=>{throw Error('not used')},lookup:async()=>null,get:async()=>null,save:async()=>{}})
const server=new McpServer({name:'video-fixture',version:'1'});registerVideoTools(server,async()=>actor,service)
const client=new Client({name:'external-assistant',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair()
try{
 await server.connect(b);await client.connect(a)
 const list=await client.listTools();assert.equal(list.tools.length,Object.keys(VIDEO_TOOLS).length)
 for(const t of list.tools){assert(t.title);assert.equal(typeof t.annotations?.readOnlyHint,'boolean');assert(t.inputSchema.additionalProperties===false)}
 const result=await client.callTool({name:'video_get_project',arguments:{brandId:'b1',projectId:'p1'}})
 assert.equal(result.isError,false);assert.equal((result.structuredContent as any).progress.percent,30)
 const native=await service.call(actor,'video_get_project',{brandId:'b1',projectId:'p1'});assert.deepEqual(result.structuredContent,native)
 const n=dispatch
 const bad=await client.callTool({name:'video_get_project',arguments:{brandId:'b1',projectId:'p1',actorId:'admin'}});assert.equal(bad.isError,true);assert.equal(dispatch,n)
 const forbidden=await client.callTool({name:'video_request_generation',arguments:{brandId:'b1',projectId:'p1',expectedRevision:'a'.repeat(64),requestKey:'test-0001',approved:true}});assert.equal(forbidden.isError,true);assert.equal(dispatch,n)
 actor=null;const revoked=await client.callTool({name:'video_get_project',arguments:{brandId:'b1',projectId:'p1'}});assert.equal(revoked.isError,true);assert.equal(dispatch,n)
 console.log('PASS actual MCP transport: strict schemas, all tools discoverable, same native/external result, injected actor/approval rejected before side effect, authentication checked per call')
}finally{await client.close();await server.close()}
