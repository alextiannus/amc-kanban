import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const bundled=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/agents/page';createRoot(document.getElementById('root')).render(<Page/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',plugins:[{name:'link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:"import React from 'react';export default function Link(props){return React.createElement('a',props)}",loader:'js',resolveDir:process.cwd()}))}}]});
// Compile production Tailwind rules, including the actual page.
const {default:postcss}=await import('postcss');const {default:tailwind}=await import('@tailwindcss/postcss');
const css=(await postcss([tailwind()]).process('@import "tailwindcss";',{from:process.cwd()+'/src/app/globals.css'})).css;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundled.outputFiles[0].text:req.url==='/style.css'?css:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();let fail=false,readonly=false;let writes=0;
 const skill={id:'sample/SKILL.md',name:'sample',content:'# Sample\nOriginal',version:'revision:1',installed:true,source:'custom'};
 const agent={id:'agent-a',name:'示例 AI Agent',description:'用于界面交互回归',kind:'registered',acceptsSkills:true,canManage:true,skills:[skill]};
 await page.route('**/api/agent-skills',async route=>{if(route.request().method()==='POST'){writes++;if(fail)return route.fulfill({status:409,json:{error:'此 Skill 已被修改，请保留草稿并重新加载最新版本'}});const body=route.request().postDataJSON();const current=agent.skills.find(s=>s.id===body.skillId);if(body.action==='uninstall')current.installed=false;else if(current){current.content=body.content;current.installed=true;current.version='revision:2'}else agent.skills.push({id:body.skillId,name:body.skillId.split('/')[0],content:body.content,version:'revision:1',source:'custom',installed:true});return route.fulfill({json:{version:'revision:2'}})}return route.fulfill({json:{agents:[{...agent,canManage:!readonly}],catalog:[]}})});
 await page.goto(origin);await page.getByRole('heading',{name:'示例 AI Agent'}).waitFor();
 await mkdir('../screenshots',{recursive:true});
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);await page.screenshot({path:`../screenshots/agents-${width}.png`,fullPage:true})}
 await page.getByRole('button',{name:'查看 / 编辑'}).click();await page.getByLabel('Markdown 内容').fill('# Sample\nModified');fail=true;await page.getByRole('button',{name:'保存修改'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Markdown 内容').inputValue(),'# Sample\nModified');fail=false;await page.getByRole('button',{name:'保存修改'}).click();await page.getByText('配置已保存，外部运行端需通过 API 读取。').waitFor();assert.equal(skill.content,'# Sample\nModified');
 await page.getByRole('button',{name:'安装新 Skill'}).click();await page.getByLabel('Skill ID',{exact:true}).fill('new-skill/SKILL.md');await page.getByLabel('Markdown 内容').fill('# New Skill\nFollow this workflow.');await page.getByRole('button',{name:'安装 Skill',exact:true}).click();await page.getByRole('heading',{name:'new-skill',exact:true}).waitFor();assert.equal(agent.skills.length,2);
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('article').filter({has:page.getByRole('heading',{name:'new-skill',exact:true})}).getByRole('button',{name:'卸载'}).click();await page.getByText('Skill 已卸载。').waitFor();assert.equal(agent.skills[1].installed,false);
 readonly=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('只读 · 请联系管理员管理 Skills。').waitFor();assert.equal(await page.getByRole('button',{name:'安装新 Skill'}).count(),0);assert.equal(await page.getByRole('button',{name:'卸载'}).count(),0);assert.equal(writes,4);
 console.log('PASS: actual page at 320/390/768/1440, editing, conflict draft preservation, install, uninstall, reload, read-only controls. HTTP mocked; no live business effects.');
}finally{await browser.close();server.close()}
