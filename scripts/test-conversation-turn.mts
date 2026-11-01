import assert from 'node:assert/strict'
import {conversationTurnMessages,repeatsPreviousReply} from '../src/lib/ai-native/conversation-turn.ts'
const messages=[{role:'system',content:'policy'},{role:'user',content:'large old source and previous question'}]
const intent={kind:'conversation',goal:'Our customers are outlet owners. Do not publish.'}
const projected=conversationTurnMessages(messages,intent)
assert.deepEqual(projected.at(-1),{role:'user',content:intent.goal})
assert.equal(messages.length,2);assert.equal(projected.filter(m=>m.role==='system').some(m=>m.content.includes(intent.goal)),false)
assert.equal(conversationTurnMessages(messages,{kind:'video_rewrite',goal:'edit'}),messages)
const previous='Previous unanswered question. '.repeat(10)
assert(repeatsPreviousReply(previous,previous,intent.goal))
assert(!repeatsPreviousReply(previous,previous,'Please repeat the same reply'))
assert(!repeatsPreviousReply('Okay','Okay','Thanks'))
assert(!repeatsPreviousReply(previous+' Saved',previous,intent.goal))
console.log('PASS current goal remains final user message; previous long reply cannot pass unchanged; explicit repetition and short acknowledgements remain valid')
