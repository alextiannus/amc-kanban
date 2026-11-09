import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {build} from 'esbuild'
import {chromium} from 'playwright'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const output=path.resolve('../ui');await mkdir(output,{recursive:true})
const videoPath=path.join(output,'test-fixture.mp4')
execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x254f45:s=360x640:r=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',videoPath])
const video=await readFile(videoPath)
const bundled=await build({stdin:{contents:`import React,{Suspense} from 'react';import {createRoot} from 'react-dom/client';import {NextIntlClientProvider} from 'next-intl';import Page from './src/app/video-assistant/confirm/[id]/page';import Receipts from '../mm/src/components/companion/BusinessReceipts';const params=Promise.resolve({id:'fixture'});createRoot(document.getElementById('app')).render(<NextIntlClientProvider locale="zh" messages={{}} timeZone="Asia/Singapore"><Suspense fallback={<p>读取中</p>}><Page params={params}/><div className="mx-auto max-w-2xl p-6"><Receipts brandId="b1" onContinue={text=>window.testContinue=text} receipts={[{tool:'video_request_generation',state:'returned',videoState:'awaiting_input',projectId:'p1',confirmationUrl:'https://amc-kanban.immedi.ai/video-assistant/confirm/fixture'}]}/></div></Suspense></NextIntlClientProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const css=(await postcss([tailwind()]).process(`@import "tailwindcss" source(none);\n@source "./src/app/video-assistant/confirm/[id]/page.tsx";\n@source "../mm/src/components/companion/BusinessReceipts.tsx";`,{from:path.resolve('fixture.css')})).css
let submissions=0,kind='generation',restored=false,progressStatus='processing',progressReads=0
const server=createServer(async(req,res)=>{
 if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundled.outputFiles[0].text);return}
 if(req.url==='/app.css'){res.setHeader('content-type','text/css');res.end(css);return}
 if(req.url==='/fixture.mp4'){res.setHeader('content-type','video/mp4');res.setHeader('content-length',video.length);res.end(video);return}
 if(req.url.startsWith('/api/content/video-assistant/project')){progressReads++;res.setHeader('content-type','application/json');res.end(JSON.stringify({projectId:'p1',status:progressStatus,progress:{stage:progressStatus==='complete'?'completed':'video_generation'},libraryState:'draft'}));return}
 if(req.url.startsWith('/api/video-assistant/confirm/')){
  res.setHeader('content-type','application/json')
  if(req.method==='POST'){submissions++;restored=true;await new Promise(r=>setTimeout(r,80));res.end(JSON.stringify({ok:true,state:kind==='final'?'approved':'submitted'}));return}
  if(kind==='expired'){res.statusCode=409;res.end(JSON.stringify({error:'制作内容已更新，请返回原对话重新确认。'}));return}
  res.end(JSON.stringify({kind,execution:restored?{state:'submitted'}:null,expiresAt:'2026-11-09T12:15:00Z',estimate:kind==='generation'?{estimatedAmount:1.2,currency:'USD',amcCredit:{amount:300,unit:'AMC Credit'}}:null,project:{title:'新品菜单短视频 · 测试',brief:'用已授权菜品素材介绍本周新品；未经确认的价格不写入。',assets:[],shots:[{shotId:'s1',durationSec:15,prompt:'先展示招牌菜品的近景，再转到用餐环境，结尾邀请查看菜单。',spokenText:'看看本周的新菜，欢迎来店品尝。',subtitle:'本周新品'}]},post:kind==='publication'?{caption:'测试发布文案',hashtags:['测试标签'],account:{displayName:'Fixture account',handle:'fixture',platformId:'tiktok'},postfastControls:{tiktokIsAigc:true}}:null,scheduledAt:'2026-11-09T13:30:00Z',previews:kind==='final'||kind==='publication'?[{id:'m1',url:'/fixture.mp4'}]:[]}));return
 }
 res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="app"></div><script src="/app.js"></script></html>')
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true});const errors=[]
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message))
 await page.goto(url);const button=page.getByRole('button',{name:'确认当前内容与费用，开始制作'});await button.waitFor()
 assert.match(await page.locator('main').innerText(),/300 AMC Credit/)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:path.join(output,'confirmation-mobile.png'),fullPage:true})
 const link=page.getByRole('link',{name:'确认制作内容与费用'});assert.equal(await link.getAttribute('href'),'https://amc-kanban.immedi.ai/video-assistant/confirm/fixture')
 await button.click();await page.getByText('已提交制作。可以返回原对话查看进度。').waitFor();assert.equal(submissions,1)
 await page.reload();await page.getByText('已提交制作。可以返回原对话查看进度。').waitFor();assert.equal(await page.locator('main').getByRole('button').count(),0);assert.equal(submissions,1)
 progressStatus='complete';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('button',{name:'查看并审核成片'}).click();assert.match(await page.evaluate(()=>window.testContinue),/p1/);
 kind='final';restored=false;await page.setViewportSize({width:1280,height:900});await page.reload();await page.getByRole('button',{name:'确认成片并保存到素材库'}).waitFor()
 await page.locator('video').evaluate(v=>new Promise((resolve,reject)=>{if(v.readyState>=1)return resolve();v.addEventListener('loadedmetadata',()=>resolve(),{once:true});v.addEventListener('error',()=>reject(Error('video decode failed')),{once:true})}))
 assert.equal(await page.locator('video').evaluate(v=>v.videoWidth),360)
 await page.screenshot({path:path.join(output,'review-desktop.png'),fullPage:true})
 kind='publication';restored=false;await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('button',{name:'确认账号、内容与排期，提交发布'}).waitFor();assert.match(await page.locator('main').innerText(),/#测试标签/);assert.match(await page.locator('main').innerText(),/fixture/);assert.match(await page.locator('main').innerText(),/标注为 AI 内容/);await page.screenshot({path:path.join(output,'publication-mobile.png'),fullPage:true});await page.getByRole('button',{name:'确认账号、内容与排期，提交发布'}).click();await page.getByText('已提交发布队列。请返回原对话查看真实投递结果。').waitFor();assert.equal(submissions,2);
 kind='expired';await page.reload();await page.getByRole('alert').waitFor();assert.equal(await page.locator('main').getByRole('button').count(),0)
 assert.deepEqual(errors,[])
 await writeFile(path.join(output,'result.json'),JSON.stringify({mobileWidth:390,desktopWidth:1280,submissions,videoDecoded:true,refreshDidNotResubmit:true,expiredApprovalBlocked:true,conversationProgressRead:true,progressReads,pageErrors:errors},null,2))
 console.log('PASS actual confirmation page + MM receipt in Chromium: mobile layout, exact cost/Credit, action link, one submit, refresh recovery, decoded preview, expired-version error; screenshots saved')
}finally{await browser.close();await new Promise(r=>server.close(r))}
