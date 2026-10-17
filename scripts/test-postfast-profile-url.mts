import assert from 'node:assert/strict'
import { postfastProfileUrl } from '../src/lib/postfastProfileUrl.ts'
assert.equal(postfastProfileUrl('instagram','poxiaoman_'), 'https://www.instagram.com/poxiaoman_/')
assert.equal(postfastProfileUrl('tiktok','poxiaoman_sg'), 'https://www.tiktok.com/@poxiaoman_sg')
assert.equal(postfastProfileUrl('instagram','@actual_user'), 'https://www.instagram.com/actual_user/')
assert.equal(postfastProfileUrl('facebook',null,'https://www.facebook.com/recorded'), 'https://www.facebook.com/recorded')
for (const input of [null, undefined, '', 'Display Name', '坡小馒', '../bad', 'x?redirect=bad', 'https://other.test', 'a-b', '@@bad']) {
 assert.equal(postfastProfileUrl('instagram',input), null)
 assert.equal(postfastProfileUrl('tiktok',input), null)
}
assert.equal(postfastProfileUrl('instagram','accounts'),null)
assert.equal(postfastProfileUrl('facebook','DisplayName'),null)
assert.equal(postfastProfileUrl('google','StoreName'),null)
assert.equal(postfastProfileUrl('instagram',null,'javascript:alert(1)'),null)
assert.equal(postfastProfileUrl('instagram',null,'https://u:secret@example.com'),null)
assert.equal(postfastProfileUrl('instagram','real','https://www.instagram.com/recorded/'),'https://www.instagram.com/recorded/')
console.log('PASS: provider-issued Instagram/TikTok usernames, explicit recorded links, unsupported identities, unsafe URLs and no display-name fallback.')
