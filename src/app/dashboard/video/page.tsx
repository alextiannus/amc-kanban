import {redirect} from 'next/navigation'

// Compatibility address: there is only one merchant video editor.
export default async function VideoEditorEntry({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams
 const query=new URLSearchParams({videoEditor:'1'})
 for(const key of ['brandId','assetIds']){const value=params[key];if(typeof value==='string'&&value)query.set(key,value)}
 redirect(`https://amc-mm.immedi.ai/dashboard?${query}`)
}
