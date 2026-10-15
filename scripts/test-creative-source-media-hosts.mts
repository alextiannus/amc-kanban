import assert from 'node:assert/strict'
import {sourceMediaAllowedHosts,sourceMediaLocation} from '../src/lib/brand-plan/creativeSourceMediaPolicy.ts'

const keys=['AMC_SOURCE_MEDIA_ALLOWED_HOSTS','HUAWEI_OBS_ENDPOINT','OBS_ENDPOINT','HUAWEI_OBS_BUCKET','OBS_BUCKET','HUAWEI_OBS_PUBLIC_BASE_URL','OBS_PUBLIC_BASE_URL'] as const
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
const privateHost='robotics.obs.ap-southeast-3.myhuaweicloud.com'
try {
 for(const key of keys)delete process.env[key]
 process.env.OBS_BUCKET='robotics'
 for(const endpoint of ['obs.ap-southeast-3.myhuaweicloud.com',privateHost,`https://${privateHost}/`]) {
  process.env.OBS_ENDPOINT=endpoint
  assert.deepEqual([...sourceMediaAllowedHosts()],[privateHost],endpoint)
 }
 process.env.OBS_PUBLIC_BASE_URL='https://CDN.example/assets/'
 assert.deepEqual([...sourceMediaAllowedHosts()].sort(),['cdn.example',privateHost].sort(),'CDN and private signing hosts coexist')
 for(const endpoint of [`HTTPS://${privateHost.toUpperCase()}/`,`${privateHost}:443`]) {
  process.env.OBS_ENDPOINT=endpoint
  assert(sourceMediaAllowedHosts().has(privateHost),endpoint)
 }
 for(const endpoint of [`${privateHost}:8443`,`${privateHost}.`,`${privateHost}?token=secret`,`${privateHost}/extra`,'user:password@obs.example']) {
  process.env.OBS_ENDPOINT=endpoint
  assert.deepEqual([...sourceMediaAllowedHosts()],['cdn.example'],endpoint)
 }
 process.env.OBS_ENDPOINT=privateHost
 for(const base of ['http://cdn.example/','https://cdn.example:8443/','https://cdn.example./','https://user:pass@cdn.example/','https://cdn.example/?token=secret','https://cdn.example/#fragment']) {
  process.env.OBS_PUBLIC_BASE_URL=base
  assert.deepEqual([...sourceMediaAllowedHosts()],[privateHost],base)
 }
 process.env.OBS_PUBLIC_BASE_URL='https://CDN.example:443/assets/'
 process.env.AMC_SOURCE_MEDIA_ALLOWED_HOSTS='MEDIA.EXAMPLE, media.example:443, other.example:8443, *.myhuaweicloud.com, internal.local, trailing.example.'
 assert.deepEqual([...sourceMediaAllowedHosts()].sort(),['media.example',privateHost,'cdn.example'].sort())
 assert(!sourceMediaAllowedHosts().has('attacker.obs.ap-southeast-3.myhuaweicloud.com'))
 assert.equal(sourceMediaLocation(`https://${privateHost}:8443/v.mp4`),null)
 assert.equal(sourceMediaLocation(`https://${privateHost}./v.mp4`),null)
 console.log('PASS: bucket endpoint normalization, private/CDN coexistence, exact hosts, casing, default-port and unsafe configuration boundaries')
} finally {for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
