import assert from 'node:assert/strict'
import {generateGrowthResearchReportForBrand} from '../src/lib/growthDataCenter.ts'
process.env.AMC_GROWTH_API_URL='https://growth-test.invalid'
let payload:any
const original=globalThis.fetch
globalThis.fetch=async(url:any,init:any)=>{assert.equal(String(url),'https://growth-test.invalid/v1/brand-intelligence-intake');payload=JSON.parse(init.body);return new Response(JSON.stringify({job_id:'fixture',status:'completed'}),{status:200})}
try{await generateGrowthResearchReportForBrand({id:'fixture-brand',name:'Fixture',location:'Singapore',industry:'Bakery'}, {brand:{name:'Fixture'}},{requestKey:'fixture-key',sourceRevision:'revision'});assert.equal(payload.report_template_version,'v3');assert.equal(payload.report_tier,'initial');assert.equal(payload.generate_advanced,false);assert.equal(payload.insight_source_revision,'revision');assert.equal(payload.insight_source_key,'amc-kanban-fixture-brand');console.log('PASS: V3 request uses supported initial tier and binds current sources')}finally{globalThis.fetch=original}
