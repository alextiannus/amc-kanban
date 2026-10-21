export const VIDEO_LANGUAGES={zh:'中文',en:'English',id:'Bahasa Indonesia',ms:'Bahasa Melayu'} as const
export type ScriptLanguage=keyof typeof VIDEO_LANGUAGES
export type VideoLanguage=ScriptLanguage|'bilingual'
export const isScriptLanguage=(v:unknown):v is ScriptLanguage=>typeof v==='string'&&Object.hasOwn(VIDEO_LANGUAGES,v)
export function marketVideoLanguage(market:unknown):ScriptLanguage|null{
 const value=typeof market==='string'?market.trim().toLowerCase():''
 if(/^(sg|singapore|新加坡)$/.test(value))return 'en'
 if(/^(id|indonesia|印尼|印度尼西亚)$/.test(value))return 'id'
 if(/^(my|malaysia|马来西亚)$/.test(value))return 'ms'
 if(/^(cn|china|中国)$/.test(value))return 'zh'
 return null
}
export const platformVideoLanguage=(platform:string,market:unknown):ScriptLanguage|null=>platform==='xiaohongshu'?'zh':marketVideoLanguage(market)
export const languagePlatforms=(language:ScriptLanguage,market:unknown)=>language==='zh'?['xiaohongshu']:marketVideoLanguage(market)===language?['tiktok']:[]
