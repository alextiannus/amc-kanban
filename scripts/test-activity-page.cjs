const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
const root=path.resolve(__dirname,'..');
function compile(file,deps={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(k=>{assert.ok(k in deps,k);return deps[k]},m,m.exports);return m.exports}
const contract=compile('src/lib/activityPage.ts');
assert.deepEqual(contract.normalizeActivityPage(null),{text:{},links:{}});
for(const x of [{drawEnabled:'yes'},{text:{zh:{greeting:'x'.repeat(501)}}},{links:{'instagram:test':'javascript:alert(1)'}},{links:{'instagram:test':'https://u:p@example.test'}},{links:{'instagram:test':'http://example.test'}},{links:[]}])assert.throws(()=>contract.normalizeActivityPage(x));
assert.equal(contract.isActivitySourceLink('instagram:test','http://www.instagram.com/test/'),true);
for(const url of ['javascript:alert(1)','https://u:p@example.test','not a url']) assert.equal(contract.isActivitySourceLink('instagram:test',url),false);
assert.equal(contract.isActivitySourceLink('bad key','https://example.test'),false);
const page={text:{zh:{greeting:'你好！'},en:{greeting:'Welcome!'}},links:{'instagram:test':'https://www.instagram.com/correct/'},drawEnabled:false};
assert.equal(contract.activityText(page,'greeting','zh'),'你好！');assert.equal(contract.activityText(page,'greeting','en'),'Welcome!');assert.equal(contract.activityText(page,'followTitle','en'),contract.activityTextDefaults.followTitle.en);
const linkLib=compile('src/lib/brandFollowLinks.ts',{'./activityPage':contract});
const brand={accounts:[{platformId:'instagram',handle:'test',profileUrl:'https://www.instagram.com/test/'}],activityPage:page};
assert.equal(linkLib.brandFollowLinks(brand)[0].url,'https://www.instagram.com/correct/');assert.equal(brand.accounts[0].profileUrl,'https://www.instagram.com/test/');
assert.equal(linkLib.brandFollowLinks({...brand,activityPage:{text:{},links:{}}})[0].url,brand.accounts[0].profileUrl);
assert.equal(linkLib.brandFollowLinks({...brand,accounts:[{...brand.accounts[0],handle:'new-owner'}]})[0].url,brand.accounts[0].profileUrl,'Changed account must not inherit the old destination override');
let authorized=true, loggedIn=true, writes=0, audits=0, gameReady=true, storageFails=false;
let stored={activityPage:null,followRewardDescription:null};
function jsonb(v){if(Array.isArray(v))return v.map(jsonb);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,jsonb(v[k])]));return v}
const tx={ $queryRaw:async()=>[], brand:{findUnique:async()=>stored,update:async({data})=>{writes++;stored=jsonb(data);return stored}}, gameConfig:{findUnique:async()=>gameReady?{prizes:[{id:'prize'}]}:null}, auditLog:{create:async()=>{audits++}}};
const api=compile('src/app/api/brands/[id]/activity-page/route.ts',{'node:crypto':require('node:crypto'),'next/server':{NextResponse:{json:Response.json}},'@/lib/auth':{getSession:async()=>loggedIn?{user:{id:'owner'}}:null},'@/lib/brandAccess':{canOwnBrand:async()=>authorized},'@/lib/prisma':{prisma:{brand:tx.brand,$transaction:fn=>storageFails?Promise.reject(new Error('database unavailable')):fn(tx)}},'@/lib/activityPageTranslation':{translateActivityPage:async page=>contract.normalizeActivityPage(page)},'@/lib/activityPage':contract});
const params={params:Promise.resolve({id:'brand'})};
const req=body=>new Request('https://amc-kanban.immedi.ai/api/brands/brand/activity-page',{method:'PUT',headers:{'content-type':'application/json',origin:'https://amc-mm.immedi.ai'},body:JSON.stringify(body)});
(async()=>{
 let data=await(await api.GET(new Request('https://example.test'),params)).json();
 let body={activityPage:page,followRewardDescription:'礼遇',revision:data.revision};
 let r=await api.PUT(req(body),params);assert.equal(r.status,200);let saved=await r.json();assert.equal(writes,1);assert.equal(audits,1);
 assert.equal((await api.PUT(req(body),params)).status,409);assert.equal(writes,1);
 // JSONB reorders object keys; the saved revision must still work on the next edit.
 r=await api.PUT(req({...body,revision:saved.revision,activityPage:{...page,text:{...page.text,zh:{greeting:'再次欢迎'}}}}),params);assert.equal(r.status,200);
 authorized=false;assert.equal((await api.GET(new Request('https://example.test'),params)).status,404);assert.equal((await api.PUT(req(body),params)).status,404);authorized=true;
 loggedIn=false;assert.equal((await api.PUT(req(body),params)).status,404);loggedIn=true;
 assert.equal((await api.PUT(new Request('https://amc-kanban.immedi.ai/api/brands/brand/activity-page',{method:'PUT',headers:{origin:'https://evil.test'},body:JSON.stringify(body)}),params)).status,403);
 data=await(await api.GET(new Request('https://example.test'),params)).json();gameReady=false;
 assert.equal((await api.PUT(req({...body,revision:data.revision,activityPage:{...page,drawEnabled:true}}),params)).status,400);
 assert.equal(writes,2);assert.equal(audits,2);
 storageFails=true;assert.equal((await api.PUT(req({...body,revision:data.revision}),params)).status,500);storageFails=false;
 assert.equal((await api.PUT(req({...body,activityPage:{links:{'instagram:test':'javascript:alert(1)'}}}),params)).status,400);
 assert.equal((await api.PUT(req(null),params)).status,400);
 assert.equal(writes,2);assert.equal(audits,2);
 assert.equal((await api.POST(new Request('http://localhost:10000/api/brands/brand/activity-page',{method:'POST',headers:{origin:'https://amc-kanban.immedi.ai','content-type':'application/json'},body:JSON.stringify(body)}),params)).status,200);
 assert.equal((await api.POST(req(body),params)).status,200);assert.equal(writes,2);assert.equal(audits,2);
 authorized=false;assert.equal((await api.POST(req(body),params)).status,404);authorized=true;
 assert.equal((await api.POST(new Request('https://example.test',{method:'POST',headers:{origin:'https://evil.test'},body:JSON.stringify(body)}),params)).status,403);
 console.log('PASS activity page: bilingual defaults, text limits, safe links, binding isolation, restoration, brand authorization, CSRF, JSONB-stable revisions, stale-save conflicts and draw readiness.');
})().catch(e=>{console.error(e);process.exit(1)});
