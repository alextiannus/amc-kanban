import assert from 'node:assert/strict'
import {preferenceSettings} from '../src/lib/ai-native/preferences.ts'
const absent={key:'brand-working-preference',revision:0,status:'absent',content:null}
const facts={id:'brand-a',name:'Noodles A',industry:'restaurant',knowledge:{brandTone:'Friendly',audienceAssumptions:'Families',negPrompts:['No invented discounts'],apiKey:'must-not-leak'}}
const result=preferenceSettings(absent,facts)
assert.equal(result.source,'brand');assert.equal(result.revision,0);assert.equal(result.content,null)
assert.match(result.effectiveContent!,/Families/);assert(!JSON.stringify(result).includes('must-not-leak'))
assert.equal(preferenceSettings({...absent,status:'active',revision:1,content:'My tone'},facts).effectiveContent,'My tone')
const forgotten=preferenceSettings({...absent,status:'forgotten',revision:2},{...facts,name:'Updated name'})
assert.match(forgotten.effectiveContent!,/Updated name/);assert.equal(forgotten.revision,2);assert.equal(forgotten.content,null)
assert(!preferenceSettings(absent,{id:'brand-b',name:'Brand B'}).effectiveContent?.includes('Families'))
assert.equal(preferenceSettings(absent,{id:'empty'}).effectiveContent,'')
assert(preferenceSettings(absent,{...facts,name:'x'.repeat(9000)}).effectiveContent!.length<4000)
console.log('PASS: current brand defaults, personal precedence, forgotten memory preserved, brand isolation, empty facts, bounded safe projection')
