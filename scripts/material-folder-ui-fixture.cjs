const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const esbuild = require('esbuild')
const postcss = require('postcss')
const tailwind = require('@tailwindcss/postcss')
const root = process.cwd(), out = path.join(root, 'output/playwright/material-folders')
fs.mkdirSync(out, { recursive: true })
async function main() {
  await esbuild.build({ stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import DashboardAssets from './src/components/dashboard/DashboardAssets';import PostEditDrawer from './src/components/dashboard/PostEditDrawer';function Fixture(){const[open,setOpen]=useState(false);return new URLSearchParams(location.search).has('draft')?<><button onClick={()=>setOpen(true)}>新建发布草稿</button><PostEditDrawer isOpen={open} onClose={()=>setOpen(false)} postId={null} brandId="fixture" onSuccess={()=>setOpen(false)}/></>:<DashboardAssets brandId="fixture"/>}createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, outfile: path.join(out, 'app.js'), platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } })
  const css = await postcss([tailwind({ base: root })]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') })
  fs.writeFileSync(path.join(out, 'app.css'), css.css)
  let counter = 10
  let folders = [
    { id: 'legacy', parentId: null, name: '历史混合目录', folderKind: 'CUSTOM', materialClass: 'UNCONFIRMED', revision: 0 },
    { id: 'food', parentId: null, name: '菜品与饮品', folderKind: 'STANDARD', systemKey: 'dishes_drinks', materialClass: 'ORIGINAL', revision: 0 },
    { id: 'video', parentId: null, name: '视频原片', folderKind: 'STANDARD', systemKey: 'original_video', materialClass: 'ORIGINAL', revision: 0 },
    { id: 'dish', parentId: 'food', name: '招牌菜实拍', folderKind: 'CUSTOM', materialClass: 'ORIGINAL', revision: 0 },
    { id: 'manual', parentId: null, name: '人工剪辑', folderKind: 'CUSTOM', materialClass: 'MANUAL', revision: 0 },
    { id: 'ai', parentId: null, name: 'AI 制作', folderKind: 'CUSTOM', materialClass: 'AI', revision: 0 },
  ]
  const picture = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#c7d2fe"/><text x="90" y="150" font-size="30">Fixture</text></svg>').toString('base64')
  const assets = ['ORIGINAL', 'MANUAL', 'AI', 'UNCONFIRMED'].map((materialClass, i) => ({ id: `asset-${i}`, brandId: 'fixture', brandName: '测试品牌', url: picture, filename: `${materialClass}.jpg`, mimeType: 'image/jpeg', folderId: ['dish', 'manual', 'ai', null][i], aiCategory: ['招牌菜实拍', '人工剪辑', 'AI 制作', '素材库'][i], materialClass, materialForm: i === 1 ? 'FINISHED' : 'UNKNOWN', aiTags: [], usedCount: 0, aiReady: true, sourceType: 'upload', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
  for (let i=4;i<33;i++) assets.push({...assets[0],id:`asset-${i}`,filename:`原始素材 ${i}.jpg`,usedCount:i%2,materialForm:i%2?'CLIP':'FINISHED'})
  assets.push(
    {...assets[3], id:'review-video-cover', filename:'有封面视频.mp4', mimeType:'video/mp4', url:'/fixture/preview.mp4', thumbnailUrl:picture, thumbnailStatus:'ready'},
    {...assets[3], id:'review-video-frame', filename:'无封面视频.mp4', mimeType:'video/mp4', url:'/fixture/preview.mp4'},
    {...assets[3], id:'review-broken', filename:'失效图片.jpg', url:'/fixture/missing.jpg', thumbnailUrl:'/fixture/missing.webp'},
  )
  assets.forEach((a,i) => a.isCoverMaterial = i < 25 && a.mimeType === 'image/jpeg')
  const drafts = []
  const receipts = new Map()
  const present = readonly => folders.map(f => {
    const lineage = [f]; while (lineage[0].parentId) lineage.unshift(folders.find(p => p.id === lineage[0].parentId))
    const children = folders.filter(p => p.parentId === f.id)
    const count = assets.filter(a => a.folderId === f.id).length
    return { ...f, depth: lineage.length, path: lineage.map(p => p.name).join(' / '), section: lineage[0].folderKind === 'STANDARD' ? 'STANDARD' : 'CUSTOM', assetCount: count, subtreeAssetCount: count + children.reduce((n, c) => n + assets.filter(a => a.folderId === c.id).length, 0), canCreateChild: !readonly && lineage.length < 3, canRename: !readonly, canMove: !readonly && f.folderKind !== 'STANDARD', canDelete: !readonly && f.folderKind !== 'STANDARD' && !count && !children.length }
  })
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    let body = ''; for await (const chunk of req) body += chunk
    const input = body ? JSON.parse(body) : {}
    const json = (data, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
    if (url.pathname === '/fixture/preview.mp4') {
      const clip = Buffer.from(fs.readFileSync(path.join(root,'scripts/fixtures/material-preview-video.base64'),'ascii').trim(),'base64')
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '')
      const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]),clip.length-1) : clip.length-1
      res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',String(end-start+1))
      if(range){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${clip.length}`)}
      return res.end(clip.subarray(start,end+1))
    }
    if (url.pathname.startsWith('/fixture/missing')) { res.statusCode=404; return res.end() }
    if (url.pathname === '/api/dashboard/assets' || url.pathname === '/api/brands/fixture/assets' && req.method === 'GET') {
      const p = url.searchParams, root = p.get('root') || p.get('materialClass'), folderId = p.get('folderId'), page = Number(p.get('page') || 1), size = Number(p.get('pageSize') || 24)
      let ids = folderId ? [folderId] : []; for (let j=0;j<3;j++) ids.push(...folders.filter(f=>ids.includes(f.parentId)).map(f=>f.id))
      const filtered = assets.filter(a => (p.get('coverOnly') !== 'true' || a.isCoverMaterial) && (p.get('mediaType') !== 'cover' || ['image/jpeg','image/png'].includes(a.mimeType)) && (!root || a.materialClass === root) && (!folderId || ids.includes(a.folderId)) && (!p.get('q') || a.filename.includes(p.get('q'))) && (p.get('usage') !== 'unused' || a.usedCount===0) && (p.get('usage') !== 'used' || a.usedCount>0) && (!p.get('materialForm') || a.materialForm===p.get('materialForm')) && (!p.get('assetType') || p.get('assetType')==='all' || a.mimeType.startsWith(p.get('assetType')+'/')))
      return json({ assets: filtered.slice((page-1)*size,page*size), total:filtered.length, page, pageSize:size, pagination:{page,pageSize:size,total:filtered.length,totalPages:Math.max(1,Math.ceil(filtered.length/size))} })
    }
    if (url.pathname.endsWith('/assets/organize')) {
      if(['rollback','rollback-cover'].includes(input.action)){const before=receipts.get(input.receiptId);if(!before)return json({error:'整理回执不存在'},409);before.forEach(previous=>Object.assign(assets.find(a=>a.id===previous.id),previous));receipts.delete(input.receiptId);return json({restored:before.length})}
      const selected=assets.filter(a=>input.assetIds.includes(a.id));if(selected.some(a=>input.revisions[a.id]!==a.updatedAt))return json({error:'素材已被修改，请刷新预览后重试'},409)
      if(input.action==='cover'&&selected.some(a=>!['image/jpeg','image/png'].includes(a.mimeType)))return json({error:'封面素材仅支持 JPEG/PNG 图片'},422)
      const receiptId=`receipt-${counter++}`;receipts.set(receiptId,selected.map(a=>({...a})));selected.forEach(a=>Object.assign(a,{...(input.action==='cover'?{isCoverMaterial:true}:{materialClass:input.materialClass,folderId:input.folderId}),updatedAt:new Date().toISOString()}));return json({updated:selected.length,receiptId,...(input.action==='cover'?{rollbackAction:'rollback-cover'}:{})})
    }
    if (url.pathname.endsWith('/folders')) {
      if (req.method === 'POST') {
        if (folders.some(f => f.name === input.name)) return json({ error: '目录名已存在' }, 409)
        const parent = folders.find(f => f.id === input.parentId)
        const folder = { id: `folder-${counter++}`, name: input.name, parentId: input.parentId, materialClass: parent?.materialClass || input.materialClass, folderKind: 'CUSTOM', revision: 0 }
        folders.push(folder); return json({ folder }, 201)
      }
      if (req.method === 'PATCH') {
        const folder = folders.find(f => f.id === input.folderId)
        if (input.revision !== folder.revision) return json({ error: '目录已发生变化，请刷新后重试' }, 409)
        if (input.name === '冲突测试') { folder.revision++; return json({ error: '目录已发生变化，请刷新后重试' }, 409) }
        if (input.name) { folder.name = input.name; assets.filter(a => a.folderId === folder.id).forEach(a => a.aiCategory = input.name) }
        if ('parentId' in input) folder.parentId = input.parentId
        folder.revision++; return json({ folder })
      }
      if (req.method === 'DELETE') { folders = folders.filter(f => f.id !== url.searchParams.get('folderId')); return json({ success: true }) }
      return json({ folders: present(false), canCreate: true, views:[{id:'COVERS',name:'封面素材',description:'集中管理发布封面图片，可在新建草稿和排期时选择；原目录与来源类别保留。',canUpload:true}] })
    }
    if (url.pathname === '/api/brands/fixture/accounts') return json({accounts:[{id:'ig-account',platformId:'instagram',handle:'fixture',displayName:'测试品牌'}]})
    if (url.pathname === '/fixture/reset-cover-state') { assets.forEach((a,i)=>a.isCoverMaterial=i<25&&a.mimeType==='image/jpeg');drafts.length=0;return json({ok:true}) }
    if (url.pathname === '/fixture/cover-state') return json({assets:assets.map(a=>({id:a.id,filename:a.filename,isCoverMaterial:a.isCoverMaterial,folderId:a.folderId,materialClass:a.materialClass})),drafts})
    if (url.pathname === '/fixture/clear-covers') { assets.forEach(a=>a.isCoverMaterial=false); return json({ok:true}) }
    if (url.pathname === '/api/brands/fixture/assets' && req.method === 'PATCH') {
      const chosen=assets.filter(a=>input.assetIds.includes(a.id))
      if(input.isCoverMaterial && chosen.some(a=>!['image/jpeg','image/png'].includes(a.mimeType)))return json({error:'封面素材仅支持 JPEG 或 PNG 图片'},422)
      chosen.forEach(a=>{if(input.isCoverMaterial!==undefined)a.isCoverMaterial=input.isCoverMaterial;a.updatedAt=new Date().toISOString()})
      return json({ok:true,assets:chosen})
    }
    if (url.pathname === '/api/brands/fixture/drafts' && req.method === 'POST') {
      const cover=assets.find(a=>a.id===input.coverAssetId)
      if(cover)cover.isCoverMaterial=true
      const draft={...input,id:`draft-${counter++}`,brandId:'fixture',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),coverAsset:cover,assetRefs:[],account:{id:input.accountId,platformId:'instagram'}}
      drafts.push(draft);return json({ok:true,draft},201)
    }
    if (url.pathname.endsWith('/asset-analysis')) return json({ batches: [] })
    if (url.pathname.startsWith('/api/')) return json({ accounts: [], creatives: [], collections: [] })
    if (['/app.js', '/app.css'].includes(url.pathname)) { res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(fs.readFileSync(path.join(out, url.pathname.slice(1)))) }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root" style="height:100dvh"></div><script src="/app.js"></script></body></html>')
  }).listen(3115, '127.0.0.1', () => console.log('Material folder UI fixture: http://127.0.0.1:3115'))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
