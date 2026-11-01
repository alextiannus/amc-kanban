import {createHash} from 'node:crypto'
export function strategyInterviewVersion(context:any){
 const interview=context?.merchantInterview,document=context?.marketingSolution?.coCreation?.interview
 const content={rawNotes:interview?.rawNotes||'',summary:interview?.summary||'',answers:interview?.answers||[],supplement:document?.content||''}
 return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}
export function compareStrategySources(context:any,report:any){
 const current={interview:strategyInterviewVersion(context),report:report?.id||null}
 const solution=context?.marketingSolution||{},previous=(solution.coCreation?.marketing_plan?.provenance||solution.marketingPlan?.provenance)?.sourceVersions
 const baselineKnown=typeof previous?.interview==='string'&&Object.hasOwn(previous,'report')
 return {baselineKnown,changedSources:baselineKnown?(['interview','report'] as const).filter(key=>previous[key]!==current[key]):[],sourceVersions:current}
}
