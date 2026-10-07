import assert from 'node:assert/strict'
import {creativeSubjectIds,diverseCreatives,duplicateCreative,exceedsCreativeSubjectLimit} from '../src/lib/ai-native/creative-diversity.ts'
import {creativePortfolioFromMarketingSolution} from '../src/lib/ai-native/facts.ts'

const sharedAdaptation={title:'东北人餐厅铁锅炖大鹅：一锅上桌全场安静',planning:'开场展示铁锅炖大鹅上桌，随后讲聚餐场景并邀请到店。'}
assert.equal(duplicateCreative(
  {...sharedAdaptation,inspirationCreativeId:'cre_a',nativeSourceSnapshot:{source:{title:'source A'}}},
  {...sharedAdaptation,inspirationCreativeId:'cre_b',nativeSourceSnapshot:{source:{title:'unrelated source B'}}},
),true,'adapted copies from different sources must be duplicates')
assert.equal(duplicateCreative(
  {...sharedAdaptation,inspirationCreativeId:'cre_a'},
  {title:'锅包肉盲测：脆壳还是酸甜汁更重要',planning:'两位顾客盲测锅包肉口感并投票。',inspirationCreativeId:'cre_b'},
),false,'different adapted premises must remain available')

const catalog=[{id:'goose',name:'铁锅炖大鹅'},{id:'pork',name:'锅包肉'}]
assert.deepEqual(creativeSubjectIds({skuIds:['goose'],planning:'任意脚本'},catalog),['sku:goose'])
assert.deepEqual(creativeSubjectIds({planning:'今天展示锅包肉的酸甜脆壳'},catalog),['sku:pork'])
assert.equal(exceedsCreativeSubjectLimit({skuIds:['goose']},[{skuIds:['goose']},{planning:'铁锅炖大鹅聚餐实拍'}],catalog),true)
assert.equal(exceedsCreativeSubjectLimit({skuIds:['pork']},[{skuIds:['goose']},{planning:'铁锅炖大鹅聚餐实拍'}],catalog),false)
assert.equal(diverseCreatives([
  {...sharedAdaptation,inspirationCreativeId:'cre_a'},
  {...sharedAdaptation,inspirationCreativeId:'cre_b'},
],[],6).length,1,'diversity selection must remove adapted duplicates')

const portfolio=creativePortfolioFromMarketingSolution({publishingCalendar:{months:{'2026-10':[
  {id:'active',title:'Active',status:'planned_unimplemented',skuIds:['goose'],inspirationCreativeId:'cre_active'},
  {id:'ordinary',title:'Ordinary calendar item',status:'planned_unimplemented'},
  {id:'archived',title:'Archived',status:'archived',skuIds:['pork']},
]}}})
assert.deepEqual(portfolio,[{month:'2026-10',id:'active',title:'Active',product:undefined,skuIds:['goose'],creativeDirection:'',sourceCreativeId:'cre_active'}])

console.log('creative diversity tests passed')
