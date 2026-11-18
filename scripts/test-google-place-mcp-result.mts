import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { googlePlaceMcpResult as result } from '../src/lib/partner/mcp/google-place-result.ts'
const parse = (s: number, d: unknown) => JSON.parse(result(s, d).content[0].text)
const success = {success:true, name:'Marymount', openingHours:['Saturday: 11:00–20:30'], rating:5, reviewsCount:4}
assert.deepEqual(result(200, success), {content:[{type:'text',text:JSON.stringify(success,null,2)}]})
const actual = {error:'Google Places API request failed',details:'The provided API key is invalid.',googleStatus:'REQUEST_DENIED'}
assert.equal(parse(502,actual).failureKind,'INVALID_API_KEY')
assert.equal(parse(502,actual).googleStatus,'REQUEST_DENIED')
assert.equal(result(502,actual).isError,true)
assert.equal(parse(400,{error:'Google Places API Key is not configured'}).failureKind,'KEY_NOT_CONFIGURED')
assert.equal(parse(403,{error:'secret'}).failureKind,'ACCESS_DENIED')
assert.equal(parse(400,{}).failureKind,'INVALID_REQUEST')
for (const status of ['NOT_FOUND','ZERO_RESULTS']) assert.equal(parse(502,{googleStatus:status}).failureKind,'PLACE_NOT_FOUND')
for (const status of ['OVER_QUERY_LIMIT','OVER_DAILY_LIMIT']) assert.equal(parse(502,{googleStatus:status}).failureKind,'QUOTA_OR_BILLING_LIMIT')
const secret = 'AIzaTEST_SECRET_DO_NOT_ECHO'
for (const body of [null, 'private', {error:secret,details:`https://provider.test?key=${secret}`,googleStatus:secret}, {...actual, details:actual.details+' '+secret}, {error:{key:secret},googleStatus:{key:secret}}]) {
  const out=JSON.stringify(result(502,body));assert.ok(!out.includes(secret));assert.ok(!out.includes('provider.test'));assert.ok(!out.includes('private'))
}
assert.equal(parse(502,{googleStatus:'invented'}).googleStatus,null)
const source=readFileSync(new URL('../src/lib/partner/mcp/server.ts',import.meta.url),'utf8')
const handler=source.split("'google_get_place_info',")[1].split("'fetch_public_social_profile',")[0]
assert.ok(handler.includes('return googlePlaceMcpResult(response.status, data)'))
assert.ok(!handler.includes('data.error'))
console.log('PASS: success, production error fixture, status classification, privacy, MCP wiring')
