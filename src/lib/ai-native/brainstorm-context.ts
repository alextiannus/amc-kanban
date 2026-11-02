import {AsyncLocalStorage} from 'node:async_hooks'
import {nativeError} from './contract'

type BrowseContext={userId:string;brandId:string;sessionId:string|null}
const contexts=new AsyncLocalStorage<BrowseContext>()
export function withBrainstormBrowse<T>(userId:string,brandId:string,sessionId:unknown,run:()=>T):T{
 if(sessionId!=null&&(typeof sessionId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sessionId)))throw nativeError('invalid_browse_session',400)
 return contexts.run({userId,brandId,sessionId:sessionId as string|null??null},run)
}
export function brainstormBrowseContext(brandId:string){const context=contexts.getStore();return context?.brandId===brandId?context:undefined}
export function brainstormFeedPeriod(brandId:string){const context=brainstormBrowseContext(brandId);return context?.sessionId?`browse:${context.userId}:${context.sessionId}`:'sources'}
export function browseMediaItems(items:any[],brandId:string){
 const sessionId=brainstormBrowseContext(brandId)?.sessionId
 if(!sessionId)return items
 const scoped=(url:unknown)=>{if(typeof url!=='string'||!url.startsWith(`/api/brands/${encodeURIComponent(brandId)}/`))return url;const value=new URL(url,'https://browse.invalid');value.searchParams.set('browseSessionId',sessionId);return value.pathname+value.search+value.hash}
 return items.map(item=>({...item,videoUrl:scoped(item.videoUrl),thumbnailUrl:scoped(item.thumbnailUrl)}))
}
