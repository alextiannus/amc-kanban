import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {UI_PAGES,parseUiAction} from '../src/lib/ai-native/ui-navigation.ts'
import {conversationInput,conversationFrom,type ConversationIntent} from '../src/lib/ai-native/contract.ts'
assert.equal(await readFile('src/lib/ai-native/ui-navigation.ts','utf8'),await readFile('../amc-mm/src/lib/assistant-navigation.ts','utf8'),'Host and UI catalogs stay identical')
const intent:ConversationIntent={kind:'conversation',topic:'general',history:[],goal:'Open calendar',brandId:'one',userId:'owner',artifactPath:'work/reply.json',requestKey:'navigation-123'}
for(const page of Object.keys(UI_PAGES)){
 const action={page,mode:'open'}
 assert.deepEqual(conversationFrom(JSON.stringify({kind:'conversation',brandId:'one',content:'Open existing controls.',contextDigest:'0'.repeat(64),uiAction:action}),intent).uiAction,action)
 assert.equal(conversationInput({goal:'Show this',currentPage:page}).currentPage,page)
}
for(const action of [{page:'https://evil.test',mode:'open'},{page:'__proto__',mode:'open'},{page:'calendar',mode:'execute'},{page:'calendar',mode:'open',url:'https://evil.test'},{page:'calendar',mode:'open',month:'2027-13'},{page:'profile',mode:'open',month:'2027-01'},{page:'assets',mode:'open',brandId:'other'}])assert.throws(()=>parseUiAction(action))
assert.deepEqual(parseUiAction({page:'calendar',mode:'open',month:'2027-03'}),{page:'calendar',mode:'open',month:'2027-03'})
assert.throws(()=>conversationInput({goal:'Open',currentPage:'bad'}))
assert.throws(()=>conversationFrom(JSON.stringify({kind:'conversation',brandId:'other',content:'Open',contextDigest:'0'.repeat(64),uiAction:{page:'assets',mode:'open'}}),intent))
console.log('PASS: bounded UI actions, all destinations, dates, current-page input, no arbitrary URL or cross-brand parameters')
