import { growthPlanningRequest, type PlanningActor } from '@/lib/growthPlanning'

const isLocal = process.env.NODE_ENV !== 'production' && process.env.RENDER !== 'true'

export async function fetchPromotionStrategyMarketCalendar(input: {
  markets?: string[]
  year?: string | number
  merchantCategory?: string
}, actor: PlanningActor) {
  const params = new URLSearchParams()
  for (const market of input.markets || []) params.append('market', market)
  if (input.year) params.set('year', String(input.year))
  if (input.merchantCategory) params.set('merchantCategory', input.merchantCategory)
  return growthPlanningRequest<{
    ok?: boolean
    error?: string
    events?: Array<Record<string, unknown>>
    contentLibraryGaps?: Array<Record<string, unknown>>
  }>(`/v1/market-calendar?${params.toString()}`, { method: 'GET' }, actor)
}

export async function matchPromotionStrategyCreativeCandidates(input: unknown) {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/, '') || (isLocal ? 'http://localhost:4010' : '')
  if (!baseUrl) throw new Error('amc_content_service_not_configured')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : '')
  const response = await fetch(`${baseUrl}/v1/content-library/match-promotion-point-creatives`, {
    signal: AbortSignal.timeout(45000),
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || `promotion_strategy_creative_match_failed:${response.status}`)
  return data as {
    brandTags?:{policy:string;tags:BrandMatchingTag[]}
    contentMatchRequestId: string
    libraryVersions: Record<string, unknown>
    creativeCandidates: Array<Record<string, unknown>>
    contentLibraryGaps: Array<Record<string, unknown>>
    candidateAssetNeeds: Array<Record<string, unknown>>
    candidateStoreVisitNeeds: Array<Record<string, unknown>>
    candidateMaterialPrintNeeds: Array<Record<string, unknown>>
  }
}

export async function matchPromotionStrategyCreativeBatch(input: unknown) {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/, '') || (isLocal ? 'http://localhost:4010' : '')
  if (!baseUrl) throw new Error('amc_content_service_not_configured')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal ? 'local-service-token' : '')
  const response = await fetch(`${baseUrl}/v1/content-library/match-promotion-point-creative-batch`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error || `promotion_strategy_creative_batch_failed:${response.status}`)
  return data as {
    contentMatchRequestId: string
    libraryVersions: Record<string, unknown>
    matches: Array<Record<string, unknown>>
    creativeCandidates: Array<Record<string, unknown>>
    contentLibraryGaps: Array<Record<string, unknown>>
    candidateAssetNeeds: Array<Record<string, unknown>>
    candidateStoreVisitNeeds: Array<Record<string, unknown>>
    candidateMaterialPrintNeeds: Array<Record<string, unknown>>
  }
}

export async function fetchCreativeSourceEvidence(creativeId:string,projection?:'browse'|'media') {
  const baseUrl=process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/,'') || (isLocal?'http://localhost:4010':'')
  if(!baseUrl)throw new Error('amc_content_service_not_configured')
  const token=process.env.AMC_CONTENT_SERVICE_TOKEN?.trim() || (isLocal?'local-service-token':'')
  const response=await fetch(`${baseUrl}/v1/content-library/source-evidence`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({creativeId,...(projection?{projection}:{})})})
  if(!response.ok){await response.body?.cancel();throw new Error(response.status===413?'library_evidence_too_large':response.status===404?'original_evidence_not_found':'original_evidence_unavailable')}
  const configured=Number(process.env.AMC_SOURCE_EVIDENCE_MAX_BYTES)
  const limit=Number.isSafeInteger(configured)&&configured>0&&configured<=64*1024*1024?configured:8*1024*1024
  if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('library_evidence_too_large')}
  if(!response.body)throw new Error('original_evidence_unavailable')
  const reader=response.body.getReader(),chunks:Uint8Array[]=[]
  let size=0
  try {
    while(true){
      const {done,value}=await reader.read()
      if(done)break
      size+=value.byteLength
      if(size>limit){await reader.cancel();throw new Error('library_evidence_too_large')}
      chunks.push(value)
    }
  } finally {reader.releaseLock()}
  return JSON.parse(Buffer.concat(chunks,size).toString('utf8'))
}

export async function fetchCreativeSourceThumbnail(raw:{creativeId:string;sourceRevision:string;sourceDigest:string},signal?:AbortSignal){
 const baseUrl=process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/,'')||(isLocal?'http://localhost:4010':'')
 if(!baseUrl)throw new Error('amc_content_service_not_configured')
 const token=process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()||(isLocal?'local-service-token':'')
 const response=await fetch(`${baseUrl}/v1/content-library/source-thumbnail`,{method:'POST',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000),headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({creativeId:raw.creativeId,sourceRevision:raw.sourceRevision,sourceDigest:raw.sourceDigest})})
 if(!response.ok){await response.body?.cancel();throw new Error('creative_thumbnail_unavailable')}
 const data=await response.json()
 if(data.creativeId!==raw.creativeId||data.sourceRevision!==raw.sourceRevision||data.sourceDigest!==raw.sourceDigest||data.mimeType!=='image/webp'||typeof data.image!=='string'||data.image.length>1_400_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.image))throw new Error('creative_thumbnail_unavailable')
 return new Response(Buffer.from(data.image,'base64'),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}

export type BrandMatchingTag={id:string;label:string;aliases:string[]}
export async function fetchBrandMatchingTags(context:unknown):Promise<{policy:string;vocabularyVersion:string;tags:BrandMatchingTag[]}>{
 const baseUrl=process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/$/,'')||(isLocal?'http://localhost:4010':'')
 if(!baseUrl)throw new Error('amc_content_service_not_configured')
 const token=process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()||(isLocal?'local-service-token':'')
 const response=await fetch(`${baseUrl}/v1/content-library/brand-tags`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(context)})
 if(!response.ok)throw new Error('brand_tags_unavailable')
 const data=await response.json()
 if(data.policy!=='material-brand-tags-v2'||!Array.isArray(data.tags)||data.tags.length>32||data.tags.some((t:any)=>typeof t.id!=='string'||!t.id.startsWith('tag_')||typeof t.label!=='string'||!Array.isArray(t.aliases)))throw new Error('invalid_brand_tags')
 return data
}
