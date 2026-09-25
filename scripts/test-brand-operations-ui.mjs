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
  let role='ADMIN', fail=false, saved=false, patchCount=0, failSave=false, brandWrites=0, accountWrites=0;
  const p = id=>({id,nickname:id==='new'?'新主理人':'运营同事',email:id+'@example.test'});
  const fixture=()=>({rows:[{id:'brand-test',name:'测试餐饮品牌',location:'Downtown, Singapore',status:'ACTIVE',subscription:{id:'s1',planName:'AMC Essential',status:'ACTIVE',effectiveStatus:'ACTIVE',feeWaived:false,contractStartDate:'2026-08-01T00:00:00Z',contractEndDate:'2026-10-20T00:00:00Z'},owners:[{id:'owner',nickname:'品牌老板',email:'owner@example.test'}],principals:[p(saved?'new':'old')],socialAccounts:[{id:'account-1',platformId:'instagram',handle:'testbrand',displayName:'测试品牌 IG',profileUrl:'https://instagram.com/testbrand',followerCount:1200,followerDelta:25,ratingScore:4.8,snapshotAt:'2026-09-19T09:00:00Z',connectionStatus:'CONNECTED',disabledReason:null,monthlyPublished:8,lastPublishedAt:'2026-09-19T10:00:00Z'}],accountSummary:{totalAccounts:1,linkedAccounts:1,followers:1200,followerDelta:25,disabledAccounts:0,healthScore:100,healthStatus:'HEALTHY'},monthlyPublished:12,lastPublishedAt:'2026-09-19T10:00:00Z',assignmentVersion:'version-1'}],total:1,page:1,pageSize:25,canManage:role==='ADMIN',candidates:[p('old'),p('new')],principalOptions:[p('old')],period:{start:'2026-08-31T16:00:00Z',end:'2026-09-20T10:00:00Z',timezone:'Asia/Singapore'},summary:{brands:1,active:1,expiring:1,monthlyPublished:12,accounts:1,linkedAccounts:1,attentionBrands:0,followers:1200,followerDelta:25}});
  await context.route('**/api/**',async route=>{
   const url=new URL(route.request().url());let body={},status=200;
   if(url.pathname==='/api/auth/me')body={id:'test-admin',email:'test@example.test',role,userRoles:[role],permissions:['brand.read','analytics.read']};
   else if(url.pathname==='/api/brands')body=[];
   else if(url.pathname==='/api/admin/brands')body=[{...fixture().rows[0],timezone:'Asia/Singapore',autoPilot:false,owners:[{userId:'owner',role:'owner',user:{id:'owner',email:'owner@example.test',nickname:'品牌老板'}}],brandAgents:[],subscriptions:[{...fixture().rows[0].subscription,planId:'essential',durationMonths:12}],_count:{actionItems:0,contents:0},updatedAt:'2026-09-21T00:00:00Z'}];
   else if(url.pathname==='/api/admin/brands/brand-test' && route.request().method()==='PATCH'){brandWrites++;const payload=route.request().postDataJSON();assert.equal(payload.principalId,'new');assert.equal(payload.principalVersion,'v1');assert.equal(payload.planId,undefined);assert.equal(payload.subscriptionStatus,undefined);status=failSave?409:200;body=failSave?{error:'保存冲突'}:{ok:true};}
   else if(url.pathname==='/api/brands/brand-test/accounts/account-1' && route.request().method()==='PATCH'){accountWrites++;assert.equal(url.searchParams.get('public'),'1');const payload=route.request().postDataJSON();assert.equal(payload.handle,'testbrand');assert.equal(payload.profileUrl,'https://instagram.com/testbrand');body={ok:true};}
   else if(url.pathname==='/api/admin/users' || url.pathname.endsWith('/members') || url.pathname.endsWith('/decisions'))body=[];
   else if(url.pathname.endsWith('/principal') && route.request().method()==='GET')body={current:[p('old')],candidates:[p('old'),p('new')],version:'v1'};
   else if(url.pathname==='/api/brand-operations') { if(fail){body={error:'测试加载失败'};status=503}else{body=fixture();if(url.searchParams.get('q')){body.rows=[];body.total=0}} }
   else if(url.pathname.endsWith('/principal')){patchCount++;const req=route.request().postDataJSON();assert.equal(req.principalId,'new');assert.equal(req.expectedVersion,'version-1');saved=true;body={ok:true};}
   await route.fulfill({status,json:body});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:3105/board?tab=managementOverview');
  await page.getByRole('cell',{name:/测试餐饮品牌.*新加坡/}).waitFor({timeout:60000});
  await page.screenshot({path:'/tmp/amc-brand-operations-desktop.png',fullPage:true});
  assert.equal(await page.getByRole('button',{name:/更换主理人/}).count(),0);
  assert.equal(await page.getByRole('columnheader',{name:'品牌主',exact:true}).count(),0);
  assert.equal(await page.locator('thead th').count(),7);
  assert.equal((await page.locator('tbody tr').first().locator('td').first().innerText()).replace(/\s/g,''),'测试餐饮品牌新加坡');
  assert(await page.locator('tbody td').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).whiteSpace==='nowrap')));
  await page.getByPlaceholder('搜索品牌、账号、位置或主理人').fill('not-found');
  await page.getByText('没有符合条件的订阅品牌',{exact:true}).waitFor();
  await page.getByPlaceholder('搜索品牌、账号、位置或主理人').fill('');
  await page.getByRole('cell',{name:/测试餐饮品牌.*新加坡/}).waitFor();
  await page.getByLabel('主理人筛选',{exact:true}).selectOption('old');
  await page.getByRole('cell',{name:/测试餐饮品牌.*新加坡/}).waitFor();
  fail=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('测试加载失败',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('主理人筛选',{exact:true}).inputValue(),'old');
  assert.equal(await page.getByLabel('主理人筛选',{exact:true}).locator('option:checked').textContent(),'运营同事');
  fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('cell',{name:/测试餐饮品牌.*新加坡/}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/amc-brand-operations-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile root must not overflow');
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await page.getByRole('link',{name:'编辑品牌：测试餐饮品牌'}).getAttribute('href'),'/admin?tab=brands&brandId=brand-test&returnTo=managementOverview');
  await page.getByRole('button',{name:'查看账号表现：测试餐饮品牌'}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('link',{name:'打开账号'}).getAttribute('href'),'https://instagram.com/testbrand');
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('button',{name:'保存账号资料'}).click();
  await page.getByRole('button',{name:'关闭账号详情'}).click();
  await page.getByRole('cell',{name:'12',exact:true}).click();
  await page.waitForURL('**/admin?tab=brands&brandId=brand-test&returnTo=managementOverview');
  await page.getByRole('heading',{name:'编辑品牌: 测试餐饮品牌',exact:true}).waitFor();
  assert((await page.getByRole('button',{name:'保存修改',exact:true}).boundingBox()).width > 75);
  await page.getByLabel('选择品牌主理人').selectOption('new');
  assert.equal(await page.getByRole('button',{name:'指派主理人',exact:true}).count(),0);
  assert.equal(brandWrites,0);assert.equal(patchCount,0);
  await page.screenshot({path:'/tmp/amc-brand-row-admin-edit.png',fullPage:true});
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.waitForURL('**/board?tab=managementOverview');
  await page.getByRole('cell',{name:'12',exact:true}).click();
  await page.getByRole('button',{name:'关闭品牌编辑',exact:true}).click();
  await page.waitForURL('**/board?tab=managementOverview');
  await page.getByRole('cell',{name:'12',exact:true}).click();
  await page.getByLabel('选择品牌主理人').selectOption('new');
  failSave=true;const failedResponse=page.waitForResponse(r=>r.url().endsWith('/api/admin/brands/brand-test') && r.request().method()==='PATCH');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();assert.equal((await failedResponse).status(),409);
  await page.getByRole('button',{name:'保存修改',exact:true}).waitFor();
  assert(new URL(page.url()).pathname==='/admin','failed save stays in editor');
  failSave=false;await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.waitForURL('**/board?tab=managementOverview');
  await page.goto('http://127.0.0.1:3105/admin?tab=brands&brandId=brand-test');
  await page.getByRole('heading',{name:'编辑品牌: 测试餐饮品牌',exact:true}).waitFor();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(new URL(page.url()).pathname,'/admin');
  assert.equal(await page.getByRole('heading',{name:'编辑品牌: 测试餐饮品牌',exact:true}).count(),0);
  role='AMC_PRINCIPAL';await page.goto('http://127.0.0.1:3105/board?tab=managementOverview');await page.getByRole('cell',{name:/测试餐饮品牌.*新加坡/}).waitFor();assert.equal(await page.getByRole('button',{name:'更换主理人：测试餐饮品牌'}).count(),0);
  assert.equal(await page.getByRole('link',{name:'编辑品牌：测试餐饮品牌'}).getAttribute('href'),'/board?tab=dashboard&brandId=brand-test&returnTo=managementOverview');
  assert.equal(brandWrites,2);assert.equal(accountWrites,1);assert.equal(patchCount,0);assert.deepEqual(errors,[]);console.log('UI passed: compact account metrics, account details/link/edit, unified principal save, return flow, desktop/mobile and error recovery');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
