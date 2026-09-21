// Isolated preview page renders BrandPrincipalEditor with brandId="test-brand".
// All API calls are intercepted; use the local JWT secret from the operations UI test.
import { chromium } from 'playwright'
import { SignJWT } from 'jose'
import assert from 'node:assert/strict'
const browser = await chromium.launch({headless:true,channel:'chrome'})
try {
 const context=await browser.newContext({viewport:{width:1000,height:800}})
 const token=await new SignJWT({sub:'admin-test'}).setProtectedHeader({alg:'HS256'}).setIssuer('amc-kanban').setAudience('amc-users').setExpirationTime('1h').sign(new TextEncoder().encode('brand-operations-local-ui-test-only'))
 await context.addCookies([{name:'session',value:token,domain:'127.0.0.1',path:'/'}])
 let current='old',version='v1',conflict=false,fail=false,empty=false,patches=0
 const person=id=>({id,nickname:id==='old'?'原负责人':'新负责人',email:id+'@example.test',type:'HUMAN',status:'ACTIVE'})
 await context.route('**/api/**',async route=>{
  const req=route.request();let body={},status=200
  if(req.url().includes('/principal')) {
   if(req.method()==='PATCH'){patches++;const data=req.postDataJSON();assert.equal(data.expectedVersion,version);if(conflict){status=409;body={error:'品牌成员已变更，请刷新后重试'}}else{current=data.principalId;version='v'+(patches+1);body={ok:true}}}
   else if(fail){status=503;body={error:'读取团队失败'}}
   else body={version,current:empty?[]:[person(current)],candidates:empty?[]:[person('old'),person('new')]}
  }
  await route.fulfill({status,json:body})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:3105/principal-editor-preview')
 await page.getByText('当前负责人：原负责人',{exact:true}).waitFor()
 assert(await page.getByRole('button',{name:'指派主理人',exact:true}).isDisabled())
 await page.getByLabel('选择品牌主理人').selectOption('new')
 await page.getByRole('button',{name:'指派主理人',exact:true}).click()
 await page.getByText('当前负责人：新负责人',{exact:true}).waitFor();assert.equal(patches,1)
 await page.screenshot({path:'/tmp/amc-admin-principal-desktop.png'})
 conflict=true
 await page.getByLabel('选择品牌主理人').selectOption('old');await page.getByRole('button',{name:'指派主理人',exact:true}).click()
 await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'指派主理人',exact:true}).isDisabled())
 conflict=false;await page.getByRole('button',{name:'刷新团队'}).click();await page.getByText('当前负责人：新负责人',{exact:true}).waitFor()
 fail=true;await page.getByRole('button',{name:'刷新团队'}).click();await page.getByText('读取团队失败',{exact:true}).waitFor()
 assert(await page.getByRole('button',{name:'指派主理人',exact:true}).isDisabled())
 fail=false;empty=true;await page.getByRole('button',{name:'刷新团队'}).click();await page.getByText('当前负责人：未指派',{exact:true}).waitFor()
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/amc-admin-principal-mobile.png'})
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 assert.deepEqual(errors,[])
 console.log('Admin principal UI passed: existing assignment, save, conflict refresh, load failure, empty team and mobile')
} finally {await browser.close()}
