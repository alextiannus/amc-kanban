export function sourceMediaAllowedHosts() {
  const configured=(process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS||'').split(',').map(host=>host.trim().toLowerCase()).filter(Boolean)
  const endpoint=(process.env.HUAWEI_OBS_ENDPOINT||process.env.OBS_ENDPOINT||'obs.ap-southeast-3.myhuaweicloud.com').replace(/^https?:\/\//,'').replace(/\/+$/,'')
  const bucket=process.env.HUAWEI_OBS_BUCKET||process.env.OBS_BUCKET||'robotics'
  const base=process.env.HUAWEI_OBS_PUBLIC_BASE_URL||process.env.OBS_PUBLIC_BASE_URL||`https://${bucket}.${endpoint}`
  try {configured.push(new URL(base).hostname.toLowerCase())} catch {/* Invalid infrastructure configuration cannot expand access. */}
  return new Set(configured)
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
