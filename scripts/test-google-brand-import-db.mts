import assert from 'node:assert/strict'
import { prisma } from '../src/lib/prisma.ts'
import { queueGoogleBrandImport, runGoogleBrandImport } from '../src/lib/googleBrandImport.ts'
if (!process.env.DATABASE_URL?.includes('localhost') || !process.env.DATABASE_URL.includes('_test_')) throw new Error('Isolated local test database required')
const original = globalThis.fetch
let pause: (() => void) | null = null
let started: (() => void) | null = null
let fetched = new Promise<void>(r => { started = r })
const brand = await prisma.brand.create({ data: { name: 'Google import fixture', phone: 'human-phone', googleRefreshToken: 'fixture-refresh', googleClientId: 'fixture-id', googleClientSecret: 'fixture-secret', googleAccountId: 'a', googleLocationId: 'l', knowledge: { create: { negPrompts: [], menuItems: [{ id: 'human', name: 'Existing', description: 'Keep human edit' }] } } } })
globalThis.fetch = (async (url: any) => {
 const u = String(url)
 if (u.includes('oauth2')) return Response.json({ access_token: 'fixture-token' })
 if (u.includes('businessinformation')) { started?.(); if (pause) await new Promise<void>(r => { pause = r }); return Response.json({ name: 'locations/l', title: 'Fixture', phoneNumbers: { primaryPhone: 'google-phone' }, websiteUri: 'https://fixture.example', storefrontAddress: { addressLines: ['Fixture address'] } }) }
 if (u.includes('locationState')) return Response.json({ locationState: { canHaveFoodMenu: true } })
 if (u.includes('foodMenus')) return Response.json({ menus: [{ sections: [{ items: [{ labels: [{ displayName: 'Menu SKU' }] }] }] }] })
 if (u.includes('/reviews?')) return Response.json({ totalReviewCount: 1, averageRating: 5, reviews: [{ comment: 'Menu SKU delicious', starRating: 'FIVE' }] })
 // Never contact Growth or a real provider in this test.
 return Response.json({ error: 'test_growth_unavailable' }, { status: 503 })
}) as typeof fetch
try {
 await queueGoogleBrandImport(brand.id)
 await Promise.all([runGoogleBrandImport(brand.id), runGoogleBrandImport(brand.id)])
 const saved = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id }, include: { knowledge: true, googleBrandImport: true } })
 assert.equal(saved.phone, 'human-phone'); assert.equal(saved.website, 'https://fixture.example')
 assert.equal((saved.knowledge!.menuItems as any[]).length, 2)
 assert.equal(saved.googleBrandImport!.status, 'COMPLETE')
 assert.equal((saved.googleBrandImport!.result as any).reviewSummary.sampleSize, 1)
 const outbox = await prisma.brandGrowthSyncState.findUnique({ where: { brandId: brand.id } })
 assert.ok(outbox!.dirtyPaths.includes('merchant.menuItems'))
 await queueGoogleBrandImport(brand.id, true); await runGoogleBrandImport(brand.id)
 assert.equal((await prisma.brandKnowledge.findUniqueOrThrow({ where: { brandId: brand.id } })).menuItems.length, 2)
 // Config changes while provider fetch is in flight must discard the old result.
 await prisma.brand.update({ where: { id: brand.id }, data: { website: null } })
 await queueGoogleBrandImport(brand.id, true)
 fetched = new Promise<void>(r => { started = r }); pause = () => undefined
 const running = runGoogleBrandImport(brand.id); await fetched
 await prisma.brand.update({ where: { id: brand.id }, data: { googleRefreshToken: null, googleLocationId: null, googleAccountId: null } })
 const release = pause as (() => void) | null; release?.(); pause = null; await running
 assert.equal((await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } })).website, null)
 await runGoogleBrandImport(brand.id)
 assert.equal((await prisma.googleBrandImport.findUniqueOrThrow({ where: { brandId: brand.id } })).status, 'NEEDS_ATTENTION')
 // The PostFast route imports only fields actually exposed by the bound account.
 await prisma.brand.update({ where: { id: brand.id }, data: { postfastApiKey: 'fixture-postfast', googleLocationName: null, googleBusinessUrl: null } })
 await prisma.socialAccount.create({ data: { brandId: brand.id, platformId: 'google', handle: 'fixture-store', postfastAccountId: 'fixture-remote' } })
 globalThis.fetch = (async (url: any) => {
   if (String(url).includes('my-social-accounts')) return Response.json([{ id: 'fixture-remote', platform: 'GOOGLE', platformUsername: 'fixture-store' }])
   if (String(url).includes('gbp-locations')) return Response.json([{ id: 'accounts/a/locations/l', title: 'Authorized store', address: 'Authorized address', mapsUri: 'https://maps.google.com/authorized' }])
   return Response.json({ error: 'test_growth_unavailable' }, { status: 503 })
 }) as typeof fetch
 await queueGoogleBrandImport(brand.id, true); await runGoogleBrandImport(brand.id)
 const partial = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id }, include: { googleBrandImport: true, knowledge: true } })
 assert.equal(partial.googleLocationName, 'Authorized store')
 assert.equal(partial.googleBusinessUrl, 'https://maps.google.com/authorized')
 assert.equal(partial.googleBrandImport.status, 'PARTIAL')
 assert.equal((partial.googleBrandImport.result as any).reviewSummary, null)
 assert.deepEqual((partial.googleBrandImport.result as any).missing, ['GOOGLE_OAUTH_REQUIRED_FOR_MENU_AND_REVIEWS'])
 assert.equal((partial.knowledge.menuItems as any[]).length, 2, 'PostFast must not fabricate additional SKUs')
 console.log('PASS: durable claim, concurrent workers, non-overwrite, SKU merge, Growth outbox, re-run dedup, disconnect during fetch')
} finally { globalThis.fetch = original; await prisma.auditLog.deleteMany({ where: { resourceId: brand.id } }); await prisma.brand.delete({ where: { id: brand.id } }); await prisma.$disconnect() }
