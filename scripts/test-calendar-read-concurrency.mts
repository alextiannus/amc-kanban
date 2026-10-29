import assert from 'node:assert/strict'
import {queryCalendarRead} from '../src/lib/brand-plan/calendarProjection.ts'
let active=0,peak=0,calls=0
const releases:Array<()=>void>=[]
const db={$queryRawUnsafe:async(_sql:string,brand:string)=>{calls++;peak=Math.max(peak,++active);await new Promise<void>(resolve=>releases.push(resolve));active--;return [{brand,items:[{id:'original'}]}]}}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
const first=queryCalendarRead(db,'calendar','a'),shared=queryCalendarRead(db,'calendar','a'),other=queryCalendarRead(db,'calendar','b')
await settle();assert.equal(calls,1);releases.shift()!();const [a,b]=await Promise.all([first,shared]);a[0].items[0].id='changed';assert.equal(b[0].items[0].id,'original');await settle();assert.equal(calls,2);releases.shift()!();await other;assert.equal(peak,1)
const fresh=queryCalendarRead(db,'calendar','a');await settle();assert.equal(calls,3);releases.shift()!();await fresh
const failing={$queryRawUnsafe:async()=>{throw Error('database unavailable')}}
await assert.rejects(queryCalendarRead(failing,'calendar','a'),/database unavailable/)
const after=queryCalendarRead(db,'calendar','c');await settle();releases.shift()!();await after
console.log('PASS in-flight deduplication, sequential large reads, no completed cache, independent results, release after failure')
