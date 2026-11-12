/** Original platform posts only. Media file URLs are never a fallback. */
export function creativeSourceLink(source:any):string|null{
 for(const value of [source?.originalPostUrl,source?.sourceVideo?.sourceUrl,source?.sourcePost?.sourceUrl]){
  if(typeof value!=='string')continue
  const link=value.trim()
  if(!/^https?:\/\//i.test(link)||/[\u0000-\u001f\u007f\\]/.test(link))continue
  try{
   const url=new URL(link)
   if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)continue
   return url.href
  }catch{}
 }
 return null
}
