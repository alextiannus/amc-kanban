import assert from 'node:assert/strict'
import {interviewDocumentBody} from '../src/lib/brand-interview-document.ts'
const names=['品牌','定位','经营目标','目标顾客','选择理由与阻碍','竞争与差异','产品与服务','表达要求','待补充']
const document=names.map(name=>`### ${name}\n事实与限定：能力规划，不代表已上线。`).join('\n\n')+'\n\n商家后续补充：优先餐饮；评论监控建设中。'
assert.equal(interviewDocumentBody('旧底稿：来源方法论\n确认保存以下草案：\n'+document),document)
assert.equal(interviewDocumentBody(document),document)
assert.equal(interviewDocumentBody('原始商家访谈，没有模板。'),'原始商家访谈，没有模板。')
const partial=document.replace('### 表达要求','### 其他说明');assert.equal(interviewDocumentBody('旧资料\n'+partial),'旧资料\n'+partial)
assert.equal(interviewDocumentBody(document+'\n历史过渡\n'+document+'\n最终补充'),document+'\n最终补充')
console.log('PASS: complete latest nine-section body, retained qualifiers/supplements, no guessed removal for partial or unstructured interviews')
