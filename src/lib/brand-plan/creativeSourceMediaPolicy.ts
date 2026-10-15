import { normalizeHuaweiObsEndpoint } from '../integrations/huaweiObsEndpoint'

export function sourceMediaAllowedHosts() {
  const allowed=new Set<string>()
  const add=(value:string,rootOnly=false)=>{
    const url=sourceMediaLocation(value)
    if(url&&!url.search&&!url.hostname.includes('*')&&(!rootOnly||url.pathname==='/'))allowed.add(url.hostname)
  }
  for(const host of (process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS||'').split(',').map(value=>value.trim()).filter(Boolean))add(`https://${host}`,true)
  const bucket=process.env.HUAWEI_OBS_BUCKET||process.env.OBS_BUCKET||'robotics'
  const endpoint=normalizeHuaweiObsEndpoint(process.env.HUAWEI_OBS_ENDPOINT||process.env.OBS_ENDPOINT||'obs.ap-southeast-3.myhuaweicloud.com',bucket)
  // Private signed reads use bucket+endpoint even when public delivery uses a CDN.
  add(`https://${bucket}.${endpoint}`,true)
  const publicBase=process.env.HUAWEI_OBS_PUBLIC_BASE_URL||process.env.OBS_PUBLIC_BASE_URL
  if(publicBase)add(publicBase)
  return allowed
}

export function sourceMediaLocation(value:unknown) {
  if(typeof value!=='string')return null
  try {
    const url=new URL(value)
    if(url.protocol!=='https:'||url.username||url.password||url.href.includes('#')||url.port&&url.port!=='443')return null
    const path=decodeURIComponent(url.pathname)
    if(/(?:^|\/)(?:admin|internal|private|lab|\.\.?)(?:\/|$)/i.test(path)||/%|\\/.test(path))return null
    if(/^(localhost|[\d.]+$|\[|.*\.(?:local|internal|localhost)$)/i.test(url.hostname)||!url.hostname.includes('.')||url.hostname.endsWith('.'))return null
    return url
  } catch {return null}
}

export function publicSourceMediaUrl(value:unknown) {
  const url=sourceMediaLocation(value)
  // Reject every query rather than maintaining a bypass-prone list of token,
  // credential, nested redirect, and provider signature parameter spellings.
  return url&&!url.search ? url.href : null
}
