// 将 9 篇 AMC 学院文章作为 ARTICLE 类型写入 Learning Hub 的 SchoolItem 表
// 用法（在 amc-kanban 目录下执行）：
//   KANBAN_AGENT_API_KEY="<你的Agent API Key>" node scripts/sync_school_articles.mjs
//
// 说明：
// - 不要把 API Key 直接写进这个文件，用环境变量传入，避免明文落盘。
// - 默认指向生产环境 https://amc-kanban.immedi.ai，如需指向其他环境用 KANBAN_BASE_URL 覆盖。

import { readFile } from 'fs/promises'
import path from 'path'

const BASE_URL = process.env.KANBAN_BASE_URL || 'https://amc-kanban.immedi.ai'
const API_KEY = process.env.KANBAN_AGENT_API_KEY

if (!API_KEY) {
  console.error('缺少环境变量 KANBAN_AGENT_API_KEY，请先设置后再运行。')
  process.exit(1)
}

const DOCS_DIR = path.join(process.cwd(), 'docs')

const ARTICLES = [
  {
    filename: 'Google Business Profile运营指南.md',
    title: 'Google Business Profile（GBP）快速掌握指南',
    desc: '理解 GBP 为什么是本地获客最重要的资产，并掌握日常运营动作。'
  },
  {
    filename: 'Facebook运营指南.md',
    title: 'Facebook 运营快速掌握指南',
    desc: '理解 Facebook 在餐饮商家营销中的独特定位，区别于 Instagram 的打法，快速上手日常运营。'
  },
  {
    filename: 'Instagram社交媒体运营快速掌握指南.md',
    title: 'Instagram 社交媒体运营快速掌握指南',
    desc: '用一篇指南快速建立 2026 年 Instagram 运营的完整认知，能独立诊断账号问题并制定运营节奏。'
  },
  {
    filename: 'TikTok运营指南.md',
    title: 'TikTok 运营快速掌握指南',
    desc: '理解 2026 年 TikTok 算法逻辑，掌握餐饮内容的脚本与发布策略。'
  },
  {
    filename: '手机短视频拍摄与剪辑实操指南.md',
    title: '手机短视频拍摄与剪辑实操指南',
    desc: '掌握用手机就能完成的餐饮内容拍摄与剪辑基本功，是 IG/TikTok/FB 内容生产的底层技能。'
  },
  {
    filename: '社交媒体形象设计与选图选色指南.md',
    title: '社交媒体形象感设计与选图选色指南',
    desc: '建立基于美感的整体视觉判断力，掌握选图选色和发图节奏的指导原则。'
  },
  {
    filename: '小红书运营深度指南.md',
    title: '小红书（Xiaohongshu/RED）运营深度指南',
    desc: '理解小红书的算法逻辑、内容机制与本地生活功能，掌握覆盖海外华人社群的实操打法。'
  },
  {
    filename: '新加坡餐饮品牌营销与自媒体获客指南.md',
    title: '新加坡餐饮品牌营销与自媒体获客完整指南',
    desc: '建立对新加坡餐饮行业品牌营销与自媒体获客的系统性认知，能独立为本地餐饮商家制定并执行营销方案。'
  },
  {
    filename: 'AMC_Brand_Manager_3Day_Course.md',
    title: '三天速成：AMC 品牌主理人上岗课程',
    desc: '3 天内具备独立运营商家社媒账号的知识储备与系统操作能力，能上手承接 Phase 0-5 全流程工作。'
  }
]

async function main() {
  for (const article of ARTICLES) {
    const filePath = path.join(DOCS_DIR, article.filename)
    let markdown
    try {
      markdown = await readFile(filePath, 'utf-8')
    } catch (err) {
      console.error(`[跳过] 读取失败: ${article.filename} — ${err.message}`)
      continue
    }

    try {
      const res = await fetch(`${BASE_URL}/api/learn/school`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          type: 'ARTICLE',
          title: article.title,
          desc: article.desc,
          markdown
        })
      })

      const text = await res.text()
      if (!res.ok) {
        console.error(`[失败 ${res.status}] ${article.title}: ${text}`)
      } else {
        console.log(`[成功] ${article.title}`)
      }
    } catch (err) {
      console.error(`[请求出错] ${article.title}: ${err.message}`)
    }
  }
}

main()
