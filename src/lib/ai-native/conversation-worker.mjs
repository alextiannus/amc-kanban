// A busy Core tick returns the in-flight promise. Keep draining after it settles,
// otherwise an admission wake is consumed by the preceding task. Core retains
// ownership, FIFO claiming, cancellation and one active execution.
const pumps=new WeakMap();
export function wakeConversationRuntime(runtime){
 const existing=pumps.get(runtime);if(existing)return existing;
 const pump=Promise.resolve().then(async()=>{
  while(await runtime.tick()){} // null means empty, standby or retired: stop here.
 }).catch(error=>console.error('[amc-ai] worker wake failed',error instanceof Error?error.name:'unknown'))
 .finally(()=>{pumps.delete(runtime)});
 pumps.set(runtime,pump);return pump;
}
