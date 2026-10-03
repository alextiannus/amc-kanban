import crypto from 'node:crypto'

// Explicit historical exclusion approved 2026-10-03. Never suppress new orphan records.
export const ignoredHistoricalSubscriptionIds: string[] = [
  "cmptx96o00001mb2bpiksurhz",
  "cmptywtuu0001kn2aj4p66vso",
  "cmptywvoc0005kn2axw02qy3u",
  "cmptz4pze000hkn2a3kzn2w2l",
  "cmptzf86y0009p028jnw3tlsr",
  "cmpu0pta20009kb2ac3pyut4g",
  "cmpu0ry1q000pkb2a8ddw9w1y",
  "cmpu10zrx0001ji2ag7y1izzb",
  "cmpu12psf000hji2ap9a22zoc",
  "cmpusf67e0009li2aioh8a4rm",
  "cmpusgpu4000dli2ajyg042l9",
  "cmpuut9b3000akb2a8j2mbr2c",
  "cmpv1wtnc0011s32an3t6b92x",
  "cmpvfa4100004hk2aaxrokfjk",
  "cmpvfni0g0001m22anma3vs7d",
  "cmpw0u38i0004mt2ai5xs72mj",
  "cmpw0wos6000omt2ab3paeoo5",
  "cmpw10lk4000umt2a2wp4tpea",
  "cmpw11h1a0010mt2ajf8d0232",
  "cmpw1sslr000ald2aqpubcf63",
  "cmpw90f1u003zjr29jmh0yueg",
  "cmpw9fvtd004xjr296yobk55a",
  "cmpwaref1000bi929auisubva",
  "cmpwdcmpi001ii92952ii40zj",
  "cmpxizb3r005mi929v5xsdg3p",
  "cmpxvkbs100a4i929le9dw91b",
  "cmpxvnb5z00abi929z7d76fa4",
  "cmpxyzwyz00bqi92922rmo9op",
  "sub_default_5f4ffc33814a575d7375",
  "sub_default_689c19146e679e262749",
  "sub_default_a7a9468f1954ed3ac935",
  "sub_default_dbc3b13948fc76e2418e"
]
export const includedSubscriptionFilter = { id: { notIn: ignoredHistoricalSubscriptionIds } }
export const isIgnoredHistoricalSubscription = (id: string) => ignoredHistoricalSubscriptionIds.includes(id)

export async function ignoreHistoricalSubscription(database: any, sourceId: string) {
 if (!isIgnoredHistoricalSubscription(sourceId)) throw new Error('Not an approved historical exclusion')
 const id = 'SUBSCRIPTION:' + sourceId
 return database.$transaction(async (tx: any) => {
  const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${id})) AS acquired`
  if (!lock.acquired) return null
  const row = await tx.immediErpSync.upsert({where:{id},create:{id,kind:'SUBSCRIPTION',sourceId},update:{}})
  // Unknown/confirmed external effects must remain available for reconciliation.
  if (row.payload || row.reference || row.status === 'SYNCED' || row.status === 'IGNORED') return row
  const updated = await tx.immediErpSync.update({where:{id},data:{status:'IGNORED',attempts:0,lastError:null,nextAttemptAt:new Date(0)}})
  await tx.auditLog.create({data:{id:crypto.randomUUID(),actorType:'SYSTEM',action:'IMMEDI_ERP_HISTORICAL_SUBSCRIPTION_IGNORED',resourceId:sourceId,resourceType:'BrandSubscription',oldValue:{status:row.status,attempts:row.attempts,lastError:row.lastError??null},newValue:{status:'IGNORED'},reason:'2026-10-03 用户确认：缺少品牌关联的历史订阅无需录入'}})
  return updated
 })
}
