// Selection is not adaptation, scheduling, production or publication.
export function matchScore(value:any):number|null {
 const score=value?.source?.matchScore??value?.nativeSourceSnapshot?.source?.matchScore??value?.matchScore
 return typeof score==='number'&&Number.isFinite(score)?score:null
}
export function rankedIdeas<T>(items:T[]):T[]{return [...items].sort((a:any,b:any)=>(matchScore(b)??-Infinity)-(matchScore(a)??-Infinity)||String(a.created_at||a.createdAt||'').localeCompare(String(b.created_at||b.createdAt||''))||String(a.id).localeCompare(String(b.id)))}
export function unfinishedDraft(draft:any,now=new Date()){
 const status=String(draft.status||'').toLowerCase()
 if(['published','done','archived','deleted','cancelled'].includes(status))return false
 // A failed/past unfinished draft still needs work: do not refill around it.
 return true
}
export function requiredIdeaCount(frequency:any,now=new Date(),timezone='Asia/Singapore'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
 const n=(key:string)=>Number(parts.find(p=>p.type===key)!.value)
 const remaining=new Date(Date.UTC(n('year'),n('month'),0)).getUTCDate()-n('day')+1
 const platforms=frequency?.platforms
 if(!platforms||typeof platforms!=='object')return 0
 const amounts=Object.values(platforms).map((v:any)=>Number.isInteger(v?.postsPerMonth)&&v.postsPerMonth>=0?v.postsPerMonth:typeof v?.postsPerWeek==='number'&&v.postsPerWeek>0?Math.ceil(v.postsPerWeek*remaining/7):typeof v?.postsPerDay==='number'&&v.postsPerDay>0?Math.ceil(v.postsPerDay*remaining):0)
 const total=amounts.reduce((a,b)=>a+b,0)
 return Number.isSafeInteger(total)&&total>0&&total<=100?total:0
}
export function sourceIdeaSeed(brandId:string,row:any,now=new Date()){
 const source=row.source,title=source.sourceVideo?.title||source.sourcePost?.title||source.title||source.contentAngle||'内容创意'
 return {id:`pool_${row.id}`,brandId,title,planning:'',aiCaption:'',materialRequirements:[],aiTags:[],platformTargets:[],contentType:source.scriptContent?.kind==='video'?'视频':'图文',status:'idea_pending',date:null,schedule:null,inspirationCreativeId:row.source_id,adaptationStatus:'awaiting_sku',skuDecision:null,nativeDaily:{poolIdeaId:row.id,taskId:row.task_id||null},nativeSourceSnapshot:{source,retrievedAt:new Date(row.created_at).toISOString(),contentMatchRequestId:row.match_id,libraryVersions:row.library_versions},createdAt:now.toISOString()}
}
