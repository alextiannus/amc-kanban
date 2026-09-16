import assert from 'node:assert/strict'
import { miniMaxFileId, miniMaxVoiceBody, parseMiniMaxVoiceJson, readMiniMaxVoiceResponse } from '../src/lib/miniMaxVoiceResponse.ts'

const largeId = '123456789012345681'
const raw = `{"file":{"file_id":${largeId}},"base_resp":{"status_code":0,"status_msg":"success"}}`
const payload = await readMiniMaxVoiceResponse(new Response(raw), 'upload')
assert.equal(miniMaxFileId(payload.file.file_id), largeId)
const wire = miniMaxVoiceBody({ file_id: payload.file.file_id, voice_id: 'merchant-test' })
assert.ok(wire.includes(`"file_id":${largeId},`))
assert.equal(parseMiniMaxVoiceJson(wire).file_id, largeId)
assert.equal(miniMaxFileId(1234), '1234')
assert.equal(miniMaxFileId('1234'), '1234')
assert.equal(parseMiniMaxVoiceJson('{"file_id":1234}').file_id, '1234')
for (const invalid of [null, undefined, 0, -1, '', '0', '12abc', '1e18', 1.5, Number(largeId)]) {
  assert.throws(() => miniMaxFileId(invalid))
}
assert.throws(() => miniMaxVoiceBody({ file_id: '1,"injected":true' }))
const quote = 'The text says "file_id":123456789012345681 and should stay unchanged'
assert.equal(parseMiniMaxVoiceJson(JSON.stringify({ text: quote })).text, quote)
assert.equal(JSON.parse(miniMaxVoiceBody({ text: quote })).text, quote)

for (const status of [200, 401, 502]) {
  await assert.rejects(readMiniMaxVoiceResponse(new Response(JSON.stringify({
    base_resp: { status_code: 1004, status_msg: 'authentication failed' },
  }), { status }), 'upload'), (error: any) => {
    assert.match(error.message, /upload.*code 1004.*authentication failed/)
    assert.equal(error.remoteRejected, true)
    assert.ok(!error.message.includes('no file_id'))
    return true
  })
}
await assert.rejects(readMiniMaxVoiceResponse(new Response('<html>gateway failure</html>', { status: 502 }), 'upload'), /HTTP 502, non-JSON/)
await assert.rejects(readMiniMaxVoiceResponse(new Response('{}'), 'upload'), /Invalid provider response/)
await assert.rejects(readMiniMaxVoiceResponse(new Response('{"base_resp":{"status_code":1004,"status_msg":"bad private-key Bearer token"}}'), 'upload', 'private-key'), (error: any) => {
  assert.ok(!error.message.includes('private-key'))
  assert.ok(!error.message.includes('Bearer token'))
  return true
})
const missing = await readMiniMaxVoiceResponse(new Response('{"base_resp":{"status_code":0}}'), 'upload')
assert.throws(() => miniMaxFileId(missing.file?.file_id), /no valid file_id/)
console.log('PASS: MiniMax upload business errors, malformed responses and lossless file IDs')
