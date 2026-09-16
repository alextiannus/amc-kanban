import { prisma } from '../prisma.ts'
import { createConnection, createModel, publish } from './registry.ts'
import { capabilityFor, CAPABILITIES, type Selection, type ModelDefinition } from './types.ts'

const db=prisma as any
export async function readDraft(client:any=db){
  return (await client.$queryRawUnsafe('SELECT * FROM "ModelManagementDraft" WHERE id=$1','default'))[0]||null
}
export async function changeDraft<T>(expectedRevision:number,actorId:string,run:(tx:any,draft:any)=>Promise<T>){
  return db.$transaction(async(tx:any)=>{
    // Shared with publication so a draft can never silently rebase while saving.
    const state=(await tx.$queryRawUnsafe('SELECT version FROM "ModelPolicyState" WHERE id=$1 FOR UPDATE','default'))[0]
    if(!state)throw new Error('Unified model migration is required')
    let draft=await readDraft(tx)
    if(!Number.isInteger(expectedRevision)||(draft?.revision||0)!==expectedRevision)throw new Error('Draft changed; reload before saving')
    if(!draft){
      const previous=state.version===null?null:(await tx.$queryRawUnsafe('SELECT configuration FROM "ModelPolicyRevision" WHERE version=$1',state.version))[0]
      draft={revision:0,baseVersion:state.version,configuration:previous?.configuration||{defaults:{},exceptions:{}},initializationReport:null}
    }
    if(draft.baseVersion!==state.version)throw new Error('Published configuration changed; reload before saving')
    const result=await run(tx,draft)
    await tx.auditLog.create({data:{actorId,actorType:'HUMAN',action:'MODEL_DRAFT_SAVED',resourceType:'ModelPolicy',resourceId:'default',newValue:{draftRevision:draft.revision+1,baseVersion:draft.baseVersion}}})
    await tx.$executeRawUnsafe('INSERT INTO "ModelManagementDraft" (id,revision,"baseVersion",configuration,"initializationReport","actorId") VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,"baseVersion"=EXCLUDED."baseVersion",configuration=EXCLUDED.configuration,"initializationReport"=EXCLUDED."initializationReport","actorId"=EXCLUDED."actorId","updatedAt"=CURRENT_TIMESTAMP','default',draft.revision+1,draft.baseVersion,JSON.stringify(draft.configuration),JSON.stringify(draft.initializationReport),actorId)
    return {result,revision:draft.revision+1}
  },{timeout:120000})
}
export async function checkSelection(selection:Selection,tx:any=db){
  if(!selection?.defaults||!selection.exceptions||Array.isArray(selection.defaults)||Array.isArray(selection.exceptions))throw new Error('Invalid model selection')
  for(const [key,id]of [...Object.entries(selection.defaults),...Object.entries(selection.exceptions)]){
    const exception=key.includes(':')
    if(exception?!/^(kanban|content|mm):[a-z_]+(?::[a-z_]+)?$/.test(key):!(CAPABILITIES as readonly string[]).includes(key))throw new Error('Invalid capability or media exception')
    const capability=exception?capabilityFor(key.split(':')[1]):key
    if(exception&&capability==='text')throw new Error('Text cannot have task exceptions')
    const model=(await tx.$queryRawUnsafe('SELECT definition FROM "ModelCatalogEntry" WHERE id=$1',id))[0]
    if(!model||model.definition.isEnabled===false||!model.definition.capabilities.includes(capability))throw new Error(`Selected model is unavailable or incompatible: ${key}`)
  }
}
export async function saveDraft(selection:Selection,expectedRevision:number,actorId:string){
  return changeDraft(expectedRevision,actorId,async(tx,draft)=>{await checkSelection(selection,tx);draft.configuration=selection})
}
export async function saveModelVersion(input:{previousModelId?:string;connectionId?:string;connection?:{name:string;protocol:string;baseUrl:string;secret?:string;previousId?:string};definition:ModelDefinition},expectedRevision:number,actorId:string){
  return changeDraft(expectedRevision,actorId,async(tx,draft)=>{
    let previous:any=null
    if(input.previousModelId){previous=(await tx.$queryRawUnsafe('SELECT * FROM "ModelCatalogEntry" WHERE id=$1',input.previousModelId))[0];if(!previous)throw new Error('Previous model unavailable')}
    let connectionId=input.connectionId
    if(input.connection){
      let secret=input.connection.secret?.trim()
      if(!secret&&input.connection.previousId){
        const old=(await tx.$queryRawUnsafe('SELECT * FROM "ModelConnection" WHERE id=$1',input.connection.previousId))[0]
        if(!old)throw new Error('Previous connection unavailable')
        if(old.protocol!==input.connection.protocol||old.baseUrl!==input.connection.baseUrl.replace(/\/+$/,''))throw new Error('Enter a credential when changing endpoint or protocol')
        const {decryptSecret}=await import('./secrets.ts');secret=decryptSecret(old.encryptedSecret)
      }
      connectionId=(await createConnection({...input.connection,secret:secret||''},actorId,tx)).id
    }
    if(!connectionId||!(await tx.$queryRawUnsafe('SELECT id FROM "ModelConnection" WHERE id=$1',connectionId))[0])throw new Error('Choose a provider connection')
    const model=await createModel({connectionId,legacyId:previous?.legacyId,definition:{...input.definition,previousModelId:previous?.id}},actorId,tx)
    if(previous){
      for(const map of [draft.configuration.defaults,draft.configuration.exceptions])for(const key of Object.keys(map))if(map[key]===previous.id){
        if(input.definition.isEnabled===false)delete map[key];else map[key]=model.id
      }
    }
    await checkSelection(draft.configuration,tx)
    return model
  })
}
export async function publishDraft(expectedRevision:number,validationId:string,actorId:string){
  return changeDraft(expectedRevision,actorId,async(tx,draft)=>{
    if(draft.initializationReport?.complete===false||(draft.baseVersion===null&&!draft.initializationReport?.complete))throw new Error('Resolve initialization issues and initialize again before publication')
    await checkSelection(draft.configuration,tx)
    const result=await publish(draft.configuration,draft.baseVersion,validationId,actorId,tx)
    draft.baseVersion=result.version
    return result
  })
}
