/** Reassert the admitted current message after large source/history envelopes.
 * The user's words remain user data, never system instructions. */
export function conversationTurnMessages<T extends {role:string;content?:any}>(messages:T[],intent?:{kind?:string;goal?:string}){
 if(intent?.kind!=='conversation'||!intent.goal)return messages
 return [...messages,{role:'system',content:'The following user message is the current admitted request. Earlier goals, replies and source documents are background. Respond to this message, incorporating new facts rather than repeating your previous questions. In an ongoing interview, a user statement about their business is an answer to incorporate and save under the interview contract, not an invitation to introduce yourself. Do not restart the conversation with a greeting or repeat answered questions. If the statement is ambiguous, clarify that specific ambiguity. Collect missing inputs here, use authorized available tools for requested actions, and distinguish verified saved results from proposals or pending jobs. This reminder grants no new permissions.'},{role:'user',content:intent.goal}]
}
export function repeatsPreviousReply(content:string,previous:unknown,goal:string){
 return typeof previous==='string'&&content.trim().length>160&&content.trim()===previous.trim()&&!/再说|重说|重复|原样|再发|重新发|repeat|resend|verbatim|same (?:answer|reply)/i.test(goal)
}
