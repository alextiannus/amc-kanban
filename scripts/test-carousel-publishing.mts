import assert from 'node:assert/strict'
import { mediaKind, socialMediaCompositionIssues, socialMediaNotice } from '../src/lib/socialMediaComposition.ts'
import { orderedDraftMedia, orderedMediaUrls } from '../src/lib/draftMedia.ts'
import { shortVideoDurationOutsideRange, shortVideoIssue } from '../src/lib/shortVideoCarousel.ts'

for (const count of [2, 10]) {
  assert.deepEqual(socialMediaCompositionIssues('instagram', Array(count).fill('video')), [])
  assert.deepEqual(socialMediaCompositionIssues('tiktok', Array(count).fill('image')), [])
  assert.match(socialMediaNotice('tiktok', Array(count).fill('image'), true)!.text, new RegExp(count + '/10'))
}
for (const platform of ['instagram', 'tiktok']) {
  assert(socialMediaCompositionIssues(platform, []).length)
  assert(socialMediaCompositionIssues(platform, Array(11).fill('image')).length)
}
assert.deepEqual(socialMediaCompositionIssues('instagram', ['image', 'video']), [])
assert(socialMediaCompositionIssues('tiktok', ['image', 'video']).some(issue => issue.field === 'mediaMix'))
assert(socialMediaCompositionIssues('tiktok', ['video', 'video']).length)
assert(socialMediaCompositionIssues('instagram', ['video', 'video'], 'REEL').length)
assert(socialMediaCompositionIssues('instagram', ['image', 'image'], 'STORY').length)
assert(socialMediaCompositionIssues('instagram', ['video'], 'TIMELINE').length)
assert.deepEqual(socialMediaCompositionIssues('instagram', ['video'], 'STORY'), [])
assert.deepEqual(socialMediaCompositionIssues('tiktok', ['image']), [])
assert.equal(mediaKind({ url: 'https://example.test/opaque', mimeType: 'video/mp4' }), 'video')
const refs = [
  { order: 1, asset: { id: 'b', url: 'https://cdn.test/b.jpg', mimeType: 'image/jpeg' } },
  { order: 0, asset: { id: 'a', url: 'https://cdn.test/a.jpg', mimeType: 'image/jpeg' } },
]
const draft = { assetRefs: refs, mediaUrls: ['https://cdn.test/external.jpg', 'https://cdn.test/b.jpg', 'https://cdn.test/a.jpg'] }
const ordered = orderedDraftMedia(draft)
assert.deepEqual(ordered.map(item => item.id), ['https://cdn.test/external.jpg', 'b', 'a'])
assert.deepEqual(orderedDraftMedia({ assetRefs: refs }).map(item => item.id), ['a', 'b'])
const removed = ordered.filter(item => item.id !== 'b')
assert.deepEqual(removed.filter(item => item.type === 'asset').map(item => item.id), ['a'], 'removing a library item keeps the unrelated external URL')
assert.deepEqual(orderedMediaUrls(removed), ['https://cdn.test/external.jpg', 'https://cdn.test/a.jpg'])
const proxy='/api/integrations/postfast/file/brand/video/key.mp4'
const proxies=orderedDraftMedia({ mediaUrls: [proxy], assetRefs: [{ asset: { id:'pf',url:'https://kanban.test'+proxy,mimeType:'video/mp4',sourceType:'postfast' } }] })
assert.equal(proxies.length,1)
assert.equal(proxies[0].id,'pf')
assert.deepEqual(orderedMediaUrls(proxies), [proxy])
console.log('Carousel composition, ordering, metadata and mixed-source removal checks passed')

for (const count of [0, 1, 2, 5, 6]) {
  const clips = Array(count).fill('video')
  assert.equal(!!shortVideoIssue('instagram', clips), count > 5)
  assert.equal(!!shortVideoIssue('instagram', clips, true), count < 2 || count > 5)
}
assert.equal(shortVideoIssue('tiktok', ['video', 'video'])?.field, 'platform')
assert.equal(shortVideoIssue('instagram', ['video', 'image'])?.field, 'mediaMix')
assert.deepEqual([2.9, 3, 5, 5.1, undefined].map(shortVideoDurationOutsideRange), [true, false, false, true, false])
