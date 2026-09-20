import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
// Start an isolated local dev server with JWT_SECRET=brand-operations-local-ui-test-only.
// All business APIs use fixtures; no production credentials or data are required.
(async () => {

 const token = await new SignJWT({sub:'test-admin'}).setProtectedHeader({alg:'HS256'}).setIssuer('amc-kanban').setAudience('amc-users').setExpirationTime('1h').sign(new TextEncoder().encode('brand-operations-local-ui-test-only'));
 const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
 try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'session',value:token,domain:'127.0.0.1',path:'/'}]);
  await context.addInitScript(()=>{localStorage.setItem('amc.currentView','managementOverview');localStorage.setItem('amc.sidebar.collapsed','false');localStorage.setItem('amc.ui.language','zh')});
  let role='ADMIN', fail=false, saved=false, patchCount=0;
  const p = id=>({id,nickname:id==='new'?'新主理人':'运营同事',email:id+'@example.test'});
  const fixture=()=>({rows:[{id:'brand-test',name:'测试餐饮品牌',location:'Singapore',status:'ACTIVE',subscription:{id:'s1',planName:'AMC Essential',status:'ACTIVE',effectiveStatus:'ACTIVE',feeWaived:false,contractStartDate:'2026-08-01T00:00:00Z',contractEndDate:'2026-10-20T00:00:00Z'},owners:[{id:'owner',nickname:'品牌老板',email:'owner@example.test'}],principals:[p(saved?'new':'old')],monthlyPublished:12,lastPublishedAt:'2026-09-19T10:00:00Z',assignmentVersion:'version-1'}],total:1,page:1,pageSize:25,canManage:role==='ADMIN',candidates:[p('old'),p('new')],principalOptions:[p('old')],period:{start:'2026-08-31T16:00:00Z',end:'2026-09-20T10:00:00Z',timezone:'Asia/Singapore'},summary:{brands:1,active:1,expiring:1,monthlyPublished:12}});
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url());let body={},status=200;
   if(url.pathname==='/api/auth/me')body={id:'test-admin',email:'test@example.test',role,userRoles:[role],permissions:['brand.read','analytics.read']};
   else if(url.pathname==='/api/brands')body=[];
   else if(url.pathname==='/api/brand-operations') { if(fail){body={error:'测试加载失败'};status=503}else{body=fixture();if(url.searchParams.get('q')){body.rows=[];body.total=0}} }
   else if(url.pathname.endsWith('/principal')){patchCount++;const req=route.request().postDataJSON();assert.equal(req.principalId,'new');assert.equal(req.expectedVersion,'version-1');saved=true;body={ok:true};}
   await route.fulfill({status,json:body});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3105/board?tab=managementOverview');
  await page.getByRole('cell',{name:'测试餐饮品牌 Singapore'}).waitFor({timeout:60000});
  await page.screenshot({path:'/tmp/amc-brand-operations-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'更换主理人：测试餐饮品牌'}).click();
  await page.getByLabel('新主理人',{exact:true}).selectOption('new');
  await page.getByRole('button',{name:'保存变更',exact:true}).click();
  await page.getByRole('cell',{name:'新主理人 更换主理人'}).waitFor();assert.equal(patchCount,1);
  await page.getByPlaceholder('搜索品牌、位置、品牌主或主理人').fill('not-found');
  await page.getByText('没有符合条件的订阅品牌',{exact:true}).waitFor();
  await page.getByPlaceholder('搜索品牌、位置、品牌主或主理人').fill('');
  await page.getByRole('cell',{name:'测试餐饮品牌 Singapore'}).waitFor();
  await page.getByLabel('主理人筛选',{exact:true}).selectOption('old');
  await page.getByRole('cell',{name:'测试餐饮品牌 Singapore'}).waitFor();
  fail=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('测试加载失败',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('主理人筛选',{exact:true}).inputValue(),'old');
  assert.equal(await page.getByLabel('主理人筛选',{exact:true}).locator('option:checked').textContent(),'运营同事');
  fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('cell',{name:'测试餐饮品牌 Singapore'}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/amc-brand-operations-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile root must not overflow');
  await page.getByRole('button',{name:'更换主理人：测试餐饮品牌'}).click();await page.screenshot({path:'/tmp/amc-brand-operations-dialog.png'});await page.keyboard.press('Escape');
  role='AMC_PRINCIPAL';await page.reload();await page.getByRole('cell',{name:'测试餐饮品牌 Singapore'}).waitFor();assert.equal(await page.getByRole('button',{name:'更换主理人：测试餐饮品牌'}).count(),0);
  assert.deepEqual(errors,[]);console.log('UI passed: desktop/mobile, save, request payload, search empty state, failure/retry, dialog Escape and principal read-only');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
