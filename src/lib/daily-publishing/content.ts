import sharp from 'sharp';
import { generateContentDirect } from '../amc-content/contentGenerationService';
import { getHuaweiObsConfig, uploadHuaweiObsObject } from '../integrations/huaweiObs';
import type { DailySource } from './sources';
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export function dailyCard(title: string) {
    const chars = Array.from(title.replace(/\s+/g, ' ').trim()).slice(0, 72), lines = [];
    for (let i = 0; i < chars.length; i += 18)
        lines.push(chars.slice(i, i + 18).join(''));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="1080" height="1350" fill="#fff9e9"/><circle cx="980" cy="80" r="260" fill="#ffce36"/><text x="90" y="220" font-size="32" font-family="sans-serif" fill="#77590a">AMC · MARKETING NOTES</text>${lines.map((l, i) => `<text x="90" y="${460 + i * 95}" font-size="48" font-family="sans-serif" fill="#282718">${xml(l)}</text>`).join('')}<path d="M90 1060H990" stroke="#dfbe56" stroke-width="3"/><text x="90" y="1160" font-family="sans-serif" font-size="36" fill="#554418">AI Marketing Crew</text><text x="90" y="1225" font-family="sans-serif" font-size="24" fill="#776849">Practical ideas for local businesses</text></svg>`;
}
/** Normalize phone photos without cropping their evidence or inventing imagery. */
export async function normalizeDailyImage(bytes:Buffer){
 return sharp(bytes,{limitInputPixels:40000000}).rotate().resize(1080,1350,{fit:'contain',background:'#fff9e9'}).png().toBuffer()
}
async function sourcePhoto(source:DailySource):Promise<Buffer|null>{
 if(source.kind!=='asset'||!source.url)return null
 const config=getHuaweiObsConfig();if(!config)return null
 const url=new URL(source.url)
 const allowed=[new URL(config.publicBaseUrl).origin,`https://${config.bucket}.${config.endpoint}`]
 if(url.username||url.password||!allowed.includes(url.origin))return null
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)})
 if(!response.ok||!response.body||Number(response.headers.get('content-length')||0)>16000000)throw Error('daily_source_media_unavailable')
 const reader=response.body.getReader(),chunks:Buffer[]=[];let length=0
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>16000000)throw Error('daily_source_media_too_large');chunks.push(Buffer.from(part.value))}}finally{await reader.cancel().catch(()=>{})}
 return normalizeDailyImage(Buffer.concat(chunks))
}
export async function composeDaily(input: {
    id: string;
    brandId: string;
    ownerId: string;
    platform: string;
    source: DailySource;
}) {
    const s = input.source;
    const photo=await sourcePhoto(s);
    const generated = await generateContentDirect({ brandId: input.brandId, platform: input.platform, actorId: input.ownerId, actorType: 'HUMAN', draftId: input.id, formatHint: 'photo_post', mediaUrls: photo && s.url ? [s.url] : [], sourceReference:{kind:s.kind,title:s.title.slice(0,300),text:s.text.slice(0,10000)},theme:'Recreate the specific supplied source as one useful original English post. Keep its topic and facts. No generic brand promotions or unsupported claims.' });
    if (!generated.caption?.trim() || generated.caption.length > 2200 || generated.caption.includes('【AI 正在创作中'))
        throw Error('daily_content_invalid');
    const title = generated.caption.split(/[\n.!?]/)[0].replace(/[#*]/g, '').trim() || s.title;
    const bytes = photo||await sharp(Buffer.from(dailyCard(title))).png().toBuffer();
    const uploaded = await uploadHuaweiObsObject({ key: `brands/${input.brandId}/daily-publishing/${input.id}.png`, body: bytes, contentType: 'image/png' });
    if (!uploaded.ok)
        throw Error('daily_media_storage_unavailable');
    return { ...generated, mediaUrl: uploaded.url, mimeType: 'image/png', title, bytes: bytes.length };
}
