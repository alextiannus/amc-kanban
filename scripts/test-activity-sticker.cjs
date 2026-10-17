const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/components/dashboard/FollowEntryCard.tsx'), 'utf8')
const ast = ts.createSourceFile('card.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function extract(name) {
 let found
 function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit) }
 visit(ast); assert.ok(found, name)
 return ts.transpileModule(found.getText(ast), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
}
const blob = new Blob(['TEST PNG'], {type:'image/png'})
const sticker = {url:'blob:https://example.test/sticker',blob}
function saveClient(navigator) {
 const notices=[], opened=[], busy=[]
 const run = vm.runInNewContext(extract('saveStickerImage')+';saveStickerImage', {sticker, savingImage:false, brandId:'test', File, navigator, isEn:false, mounted:{current:true},setStickerNotice:value=>notices.push(value),setSavingImage:value=>busy.push(value),window:{open:(...args)=>opened.push(args)}})
 return {run,notices,opened,busy}
}
;(async()=>{
 let shared
 const native=saveClient({canShare:data=>data.files[0].type==='image/png',share:async data=>{shared=data}})
 await native.run();assert.equal(shared.files[0].name,'brand-sticker-test.png');assert.equal(await shared.files[0].text(),'TEST PNG');assert.equal(native.opened.length,0);assert.equal(native.busy.at(-1),false)
 const cancelled=saveClient({canShare:()=>true,share:async()=>{throw {name:'AbortError'}}})
 await cancelled.run();assert.equal(cancelled.opened.length,0);assert.equal(cancelled.notices.length,1,'Cancellation must not trigger a download or new tab')
 const fallback=saveClient({canShare:()=>false})
 await fallback.run();assert.equal(fallback.opened[0][0],sticker.url);assert.equal(fallback.opened[0][2],'noopener,noreferrer');assert.match(fallback.notices.at(-1),/长按/)
 const failed=saveClient({canShare:()=>true,share:async()=>{throw new Error('unavailable')}})
 await failed.run();assert.match(failed.notices.at(-1),/长按/);assert.equal(failed.opened.length,0)
 let clicks=0,removes=0;const anchor={click:()=>clicks++,remove:()=>removes++}
 vm.runInNewContext(extract('downloadSticker')+';downloadSticker()', {sticker,brandId:'test',document:{createElement:()=>anchor,body:{append:()=>{}}}})
 assert.equal(anchor.href,sticker.url);assert.equal(anchor.download,'brand-sticker-test.png');assert.equal(clicks,1);assert.equal(removes,1)
 assert.doesNotMatch(extract('openStickerPreview'),/anchor\.click|window\.open|\.toDataURL/)
 console.log('PASS sticker preview without automatic download; PNG file sharing, cancellation, original-image fallback, failed-share guidance and matching Blob download.')
})().catch(error=>{console.error(error);process.exitCode=1})
