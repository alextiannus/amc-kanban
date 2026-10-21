import assert from 'node:assert/strict'
import {creativeSourceScript} from '../src/lib/brand-plan/creativeSourceScript.ts'
const timeline=Array.from({length:28},(_,i)=>({startSec:i,endSec:i+1,visualDescription:`真实画面 ${i+1}`,shotScale:'特写',cameraMovement:'推进',subjectAction:'翻炒',voiceover:`口播 ${i+1}`,onScreenText:`字幕 ${i+1}`,sound:'环境声',narrativePurpose:'展示产品',transition:'切换'}))
const script=creativeSourceScript({sourceEvidence:{originalText:'好喜欢重庆 #重庆美食',timeline}})
assert.equal((script.match(/^镜头 /gm)||[]).length,28)
for(const [i,shot] of timeline.entries()){assert(script.includes(`镜头 ${i+1} · ${i}–${i+1}s`));for(const key of ['visualDescription','shotScale','cameraMovement','subjectAction','voiceover','onScreenText','sound','narrativePurpose','transition'])assert(script.includes(shot[key]))}
assert(!script.includes('#重庆美食'))
assert.equal(creativeSourceScript({sourceEvidence:{originalText:'Only caption #food'}}),'')
assert.equal(creativeSourceScript({timeline:[],sourceEvidence:{timeline}}),script)
console.log('PASS: full 28-shot script, all shot fields, original order, no caption fallback')
