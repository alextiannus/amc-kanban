import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveInspirationCreativeId } from '../src/lib/brand-plan/inspirationCreativeLink.ts'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [brandProfile, brandPlanService, creativeEntry] = await Promise.all([
  read('src/components/dashboard/BrandProfileView.tsx'),
  read('src/lib/brand-plan/service.ts'),
  read('src/app/admin/inspiration-creatives/[id]/page.tsx'),
])

assert(brandPlanService.includes('inspirationCreativeId: calendarInspirationCreativeId(candidate)'))
assert(brandPlanService.includes('const explicitCreativeId = text(candidate?.inspirationCreativeId)'))
assert(brandPlanService.includes("stringList(candidate?.matchedCreatives).find((value) => value.startsWith('cre_'))"))
assert(!brandPlanService.includes('return inspirationId ? `cre_${inspirationId}` : undefined'))
assert(brandPlanService.includes('inspirationSourceTitle: inspirationSource.title'))
assert(brandPlanService.includes('inspirationSourceSummary: inspirationSource.summary'))
assert(brandPlanService.includes('title: item.title'))
assert(brandPlanService.includes('planning: item.planning'))
assert(brandPlanService.includes('calendar creative review returned mismatched item ids'))
assert(!brandPlanService.includes('byId.get(item.id) || reviewed[index]'))
assert(brandProfile.includes('resolveInspirationCreativeId(item)'))
assert(!brandProfile.includes('matchedInspirationId'))
assert(brandProfile.includes("href={`/admin/inspiration-creatives/${encodeURIComponent(inspirationCreativeId)}`}"))
assert(!brandProfile.includes('href={item.sampleVideoUrl || item.sampleOriginalUrl}\n                      target="_blank"\n                      rel="noreferrer"\n                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"\n                    >\n                      <ExternalLink className="h-3 w-3" />\n                      灵感来源'))
assert(creativeEntry.includes('redirect(`${contentUrl}/admin/inspiration-creatives/${encodeURIComponent(id)}#labToken='))
assert(creativeEntry.includes("if (!/^cre_[A-Za-z0-9_-]+$/.test(id))"))

assert.equal(resolveInspirationCreativeId({
  inspirationCreativeId: 'cre_ins_wrong',
  sampleVideoUrl: 'https://obs.example/content-library/SG/food_beverage/ins_exact/original/med_1-video.mp4?signature=hidden',
}), 'cre_ins_exact')
assert.equal(resolveInspirationCreativeId({
  inspirationCreativeId: 'cre_ins_explicit',
  sampleVideoUrl: 'https://www.tiktok.com/@source/video/123',
}), 'cre_ins_explicit')
assert.equal(resolveInspirationCreativeId({
  sampleVideoUrl: 'https://www.tiktok.com/@source/video/123',
}), undefined)

console.log('Brand plan inspiration detail link tests passed')
