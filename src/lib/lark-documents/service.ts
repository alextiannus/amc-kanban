import {createHash} from 'node:crypto'
import {LarkProvider,isLarkError,LarkError,LARK_SCOPES,documentId,documentUrl,plainText,editableBlock} from './provider'
import {LarkStore,unseal,type LarkActor,type LarkTokens} from './store'

export type LarkApp={appId:string;appSecret:string}
export type LarkDependencies={store:LarkStore;provider:LarkProvider;authorize:(actor:LarkActor,brandId:string,write:boolean)=>Promise<void>;app:(brandId:string)=>Promise<LarkApp|null>}
export const LARK_CALLBACK_PATH='/lark/callback'
function tokens(result:any,previous?:LarkTokens):{tokens:LarkTokens;expiresAt:Date}{
  return {tokens:{accessToken:result.access_token,refreshToken:result.refresh_token||previous?.refreshToken,refreshExpiresAt:result.refresh_token_expires_in?Date.now()+Number(result.refresh_token_expires_in)*1000:previous?.refreshExpiresAt,scope:typeof result.scope==='string'?result.scope:previous?.scope||''},expiresAt:new Date(Date.now()+result.expires_in*1000)}
}
export function createLarkService(deps:LarkDependencies){
  const {store,provider}=deps
  async function authorize(actor:LarkActor,brandId:string,write=false){await deps.authorize(actor,brandId,write)}
  async function app(brandId:string){const value=await deps.app(brandId);if(!value)throw new LarkError('LARK_APP_NOT_CONFIGURED',409);return value}
  async function token(actor:LarkActor,brandId:string){
    const config=await app(brandId)
    return store.token(actor,brandId,config.appId,async old=>tokens(await provider.token(config,{grant_type:'refresh_token',refresh_token:old.refreshToken!}),old))
  }
  async function status(actor:LarkActor,brandId:string){
    await authorize(actor,brandId)
    const config=await deps.app(brandId),row=await store.connection(actor.userId,brandId)
    const savedTokens=row?unseal<LarkTokens>(actor.userId,brandId,row.tokenCipher):null
    const renewable=!!savedTokens?.refreshToken&&(!savedTokens.refreshExpiresAt||savedTokens.refreshExpiresAt>Date.now())
    const connected=!!row&&!!config&&row.appId===config.appId&&(row.expiresAt.getTime()>Date.now()||renewable)
    return {configured:!!config,connected,brandId,account:row?.displayName||null,connectedAt:row?.connectedAt||null,expiresAt:row?.expiresAt||null,tools:['search','read','create','append','update_text_block'],requiresReconnect:!!row&&!connected}
  }
  async function start(actor:LarkActor,brandId:string,origin:string){
    await authorize(actor,brandId)
    const config=await app(brandId),redirectUri=origin+LARK_CALLBACK_PATH
    const state=await store.start(actor,brandId,config.appId,redirectUri)
    const url=new URL('https://accounts.larksuite.com/open-apis/authen/v1/authorize')
    for(const [key,value] of Object.entries({client_id:config.appId,response_type:'code',redirect_uri:redirectUri,scope:LARK_SCOPES,state:state.state,code_challenge:state.codeChallenge,code_challenge_method:'S256'}))url.searchParams.set(key,value)
    return {authorizationUrl:url.toString(),redirectUri}
  }
  async function callback(actor:LarkActor,brandId:string,state:string,code:string,origin:string){
    await authorize(actor,brandId)
    const pending=await store.consume(actor,brandId,state),config=await app(brandId)
    if(pending.appId!==config.appId||pending.redirectUri!==origin+LARK_CALLBACK_PATH)throw new LarkError('LARK_AUTHORIZATION_CONFIGURATION_CHANGED',409)
    const verifier=unseal<string>(actor.userId,brandId,pending.verifierCipher)
    const result=await provider.token(config,{grant_type:'authorization_code',code,redirect_uri:pending.redirectUri,code_verifier:verifier}),next=tokens(result)
    const identity=await provider.identity(next.tokens.accessToken)
    // Recheck revocation after external I/O; a changed identity must not acquire a connection.
    await authorize(actor,brandId)
    await store.finish(actor,pending,identity,next.tokens,next.expiresAt)
    return status(actor,brandId)
  }
  async function disconnect(actor:LarkActor,brandId:string){await authorize(actor,brandId);await store.disconnect(actor,brandId);return {connected:false}}
  async function call(actor:LarkActor,name:string,input:any){
    const write=['lark_create_document','lark_append_document','lark_update_document_block'].includes(name)
    await authorize(actor,input.brandId,write)
    if(name==='lark_connection_status')return status(actor,input.brandId)
    if(name==='lark_search_documents')return provider.search(await token(actor,input.brandId),input.query,input.pageToken)
    if(name==='lark_read_document')return provider.read(await token(actor,input.brandId),documentId(input.document),input.pageToken,input.revision)
    if(!write)throw new LarkError('LARK_TOOL_UNAVAILABLE',422)
    // Resolve credentials before reserving a write: missing authorization never looks like a submitted edit.
    const accessToken=await token(actor,input.brandId)
    return store.write(actor,input.brandId,input.requestKey,{name,...input},async()=>{
      await authorize(actor,input.brandId,true)
      let id=name==='lark_create_document'?undefined:documentId(input.document)
      let blockId:string|undefined,submitted=false
      try{
        if(name==='lark_create_document'){
          id=await provider.create(accessToken,input.title,input.folderToken);submitted=true
          if(input.text){const meta=await provider.metadata(accessToken,id);blockId=await provider.append(accessToken,id,input.text,meta.revision_id)}
        }else{
          const meta=await provider.metadata(accessToken,id!)
          if(meta.revision_id!==input.expectedRevision)throw new LarkError('LARK_DOCUMENT_REVISION_CHANGED',409)
          if(name==='lark_append_document'){submitted=true;blockId=await provider.append(accessToken,id!,input.text,input.expectedRevision)}
          else{
            const old=await provider.block(accessToken,id!,input.blockId,input.expectedRevision)
            if(!editableBlock(old))throw new LarkError('LARK_BLOCK_NOT_EDITABLE_TEXT',422)
            // Replacing rich text elements would destroy links, mentions and inline styles.
            const content=Object.values(old).find((value:any)=>value&&typeof value==='object'&&Array.isArray(value.elements)) as any
            if(content?.elements?.some((element:any)=>!element.text_run||Object.keys(element.text_run.text_element_style||{}).some(key=>element.text_run.text_element_style[key])))throw new LarkError('LARK_RICH_TEXT_BLOCK_REQUIRES_MANUAL_EDIT',422)
            submitted=true;blockId=await provider.update(accessToken,id!,input.blockId,input.text,input.expectedRevision)
          }
        }
      }catch(error){
        if(!submitted)throw error
        return {state:'outcome_unknown',verified:false,...(id?{documentId:id,url:documentUrl(id)}:{}),...(blockId?{blockId}:{}),error:isLarkError(error)?error.code:'LARK_WRITE_OUTCOME_UNCERTAIN',instructions:'The write may have been accepted. Read this original document; do not create or append again automatically.'}
      }
      try{
        const doc=await provider.metadata(accessToken,id!)
        const verified=blockId?plainText(await provider.block(accessToken,id!,blockId,doc.revision_id))===input.text:doc.title===input.title
        return {state:verified?'verified':'readback_mismatch',verified,documentId:id,url:documentUrl(id!),revision:doc.revision_id,...(blockId?{blockId}:{}),contentHash:createHash('sha256').update(input.text||input.title).digest('hex'),instructions:verified?'The requested document change was read back. This is not publication.':'The write was accepted but readback differs. Inspect the original document; do not repeat automatically.'}
      }catch{return {state:'readback_unavailable',verified:false,documentId:id,url:documentUrl(id!),...(blockId?{blockId}:{}),instructions:'Lark accepted the write; readback is unavailable. Inspect the original document before any new write.'}}
    })
  }
  return {status,start,callback,disconnect,call}
}
export type LarkService=ReturnType<typeof createLarkService>
