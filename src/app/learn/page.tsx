'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  GraduationCap,
  HelpCircle,
  BookOpen,
  ShoppingBag,
  Award,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
  Clock,
  Sparkles,
  Lock,
  ShieldAlert,
  Tags,
  PlayCircle
} from 'lucide-react'

export default function LearnPage() {
  const [activeTab, setActiveTab] = useState<'qa' | 'manual' | 'skills' | 'school'>('qa')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  // FAQ Data
  const faqs = [
    {
      q: 'AI 虚拟员工自动发帖，会不会写出不符合我们品牌调性的话？',
      a: '绝对不会。AMC 拥有专利级“主理人终审锁”机制。AI 助手根据您的产品特点和本地热门话题生成草稿后，发布任务会自动挂起锁死。必须由您在看板上亲自点击“审核通过”解锁，系统才会模拟发送，确保品牌调性 100% 受控。',
      icon: Lock,
      tag: '品牌调性控制'
    },
    {
      q: '频繁发帖会被小红书或 Instagram 判定为机器人风控/封号吗？',
      a: '我们采用本地插件桥接技术（Local Post Tunnel）。发帖指令直接安全下发至您门店的本地前台电脑，由前台浏览器模拟自然点击发出。平台识别到的是门店本地的真实 IP 和设备指纹，属于 100% 的真人本地区域操作，安全免封。',
      icon: ShieldAlert,
      tag: '安全防风控'
    },
    {
      q: '什么是“排期发布”标签？我该怎么用？',
      a: '在素材库中，您只需选中图片或视频并打上“排期发布”标签，AI 虚拟员工每日巡检时读到该标签，便会主动为您生成推文草稿并在日历上排程。草稿被正式关联使用后，该标签会自动移除并记录素材使用统计。',
      icon: Tags,
      tag: '高效发布排期'
    }
  ]

  // Stepper Manual Data
  const steps = [
    {
      num: '01',
      title: '创建与配置 AI 员工',
      desc: '进入 [主理人看板]，在 [AI 序列] 中添加新 Agent（如“小红书助手”、“数据巡检官”），设定其每日工作容量上限、所服务的品牌。',
      badge: '初始化设置'
    },
    {
      num: '02',
      title: '配置品牌基础记忆 (Workspace)',
      desc: '新品牌入驻后，AI 会自动在后台生成 brandcontext.md。您可以通过看板聊天功能，告知 AI 您的目标客户群、优惠策略、竞品特征，AI 会实时将其沉淀为“品牌长期记忆”，后续的每篇推文都将基于此上下文创作。',
      badge: '深度记忆注入'
    },
    {
      num: '03',
      title: '人机交互指令协同 (Resume)',
      desc: '当 AI 遇到无法决断的事项（如优惠券链接失效、信息缺失）时，会把任务设为 pending 并创建 require_input 任务上板。主理人只需在看板卡片评论区回复修改意见，或直接修改文案，点击 “一键 Resume”，AI 即可无缝承接继续运行。',
      badge: '实时异常处理'
    }
  ]

  // Skills Data
  const skills = [
    {
      title: '社交内容创作官 (Social Content Writer)',
      desc: '识别产品图自动生成多语言推文草稿；自动解析热门小红书排版与 Hashtag。',
      icon: '📝',
      status: 'Active',
      statusLabel: '已激活',
      features: ['多平台配图分析', '智能排版与 Hashtags', '自动生成本地化 Hooks']
    },
    {
      title: '本地口碑守护者 (GBP & Review Defender)',
      desc: '24小时监控 Google Maps / 美团商家评价。5星好评由 AI 极速秒回以拉升搜索权重；低分差评私下拦截并生成看板预警，自动派发游戏预留补偿券。',
      icon: '⭐',
      status: 'Active',
      statusLabel: '已激活',
      features: ['24h 差评预警', '五星好评秒回', '自动分发关怀礼券']
    },
    {
      title: '同城热点观察哨 (Local Trend Hunter)',
      desc: '每日两次扫描同城本地生活热门话题及竞品曝光，自动为创作线索提供本地化 Hook。',
      icon: '🔎',
      status: 'Available',
      statusLabel: '可启用',
      features: ['本地爆品情报监控', '同城热搜关键词提取', '文案爆款趋势解析']
    },
    {
      title: '数据巡检与记忆日志 (Analytics & Memory Logger)',
      desc: '周日自动拉取 PostFast / Lark 运营数据，整理成周报文档写入品牌 Memory 并回流看板。',
      icon: '🪵',
      status: 'Active',
      statusLabel: '已激活',
      features: ['指标分析报表', '自动回写 Memory', '周报推送与建议']
    }
  ]

  // Academy Data
  const courses = [
    {
      title: '零本地缓存架构 (Zero Local Cache Guide)',
      desc: '了解为什么 ACM 坚守不保存本地缓存的原则，强制 AI 每次决策均通过 MCP 或 REST 实时拉取最新上下文，规避由于信息滞后导致的决策错误。',
      duration: '15 分钟',
      progress: 80,
      btnLabel: '继续学习'
    },
    {
      title: 'O2O 本地引流裂变闭环 (Closed-loop Customer Viral Marketing)',
      desc: '学习如何将“扫码好评 -> 获得积分 -> 玩大转盘抽奖 -> 到店店员输入 PIN 核销”的闭环，与 AI 社交发布结合，为门店带来指数级的新客裂变。',
      duration: '25 分钟',
      progress: 0,
      btnLabel: '开始学习'
    }
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="mx-auto max-w-5xl px-6 py-12">
        
        {/* Navigation Breadcrumb & Back */}
        <div className="mb-6">
          <Link
            href="/board"
            className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            ← 返回看板主控台
          </Link>
        </div>

        {/* Header Section */}
        <header className="mb-10 relative">
          <div className="absolute top-0 right-0 opacity-10 blur-2xl w-48 h-48 bg-indigo-500 rounded-full pointer-events-none"></div>
          
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
            <GraduationCap size={14} /> Owner-Staff Enablement Hub
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center gap-3">
            ACM 学习中心
          </h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base text-slate-400 leading-relaxed">
            专为品牌主理人设计的人机协同与 AI 员工赋能基地。在这里，您可以学习如何深度配置、训练、和安全地监管您的 AI 员工，构建高效的同城获客系统。
          </p>
        </header>

        {/* Tab Buttons Navigation */}
        <div className="mb-8 flex rounded-xl bg-slate-900/50 p-1 border border-slate-800/80 max-w-fit overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('qa')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'qa'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 font-semibold border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 cursor-pointer'
            }`}
          >
            <HelpCircle size={16} /> 常见问答 (Q&A)
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'manual'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 font-semibold border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 cursor-pointer'
            }`}
          >
            <BookOpen size={16} /> 主理人手册 (Manual)
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'skills'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 font-semibold border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 cursor-pointer'
            }`}
          >
            <ShoppingBag size={16} /> Skill 市场 (Market)
          </button>
          <button
            onClick={() => setActiveTab('school')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'school'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 font-semibold border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 cursor-pointer'
            }`}
          >
            <Award size={16} /> AMC 学院 (School)
          </button>
        </div>

        {/* Tab Content Display */}
        <section className="min-h-[400px]">
          
          {/* FAQ PANEL */}
          {activeTab === 'qa' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-indigo-300">
                <Sparkles size={18} /> 快速解答核心运作疑问
              </h2>
              {faqs.map((faq, idx) => {
                const isOpen = openFaq === idx
                const IconComponent = faq.icon
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border transition-all duration-300 ${
                      isOpen
                        ? 'border-indigo-500/40 bg-slate-900/80 shadow-lg shadow-indigo-950/20'
                        : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700/80 hover:bg-slate-900/50'
                    }`}
                  >
                    <div
                      onClick={() => toggleFaq(idx)}
                      className="flex items-center justify-between p-4 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          <IconComponent size={18} />
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-indigo-400/90 tracking-wide uppercase block mb-0.5">
                            {faq.tag}
                          </span>
                          <h3 className="font-semibold text-slate-100 text-sm sm:text-base pr-4">
                            {faq.q}
                          </h3>
                        </div>
                      </div>
                      <div className="text-slate-400">
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-slate-800/80 p-5 bg-slate-950/50 rounded-b-xl">
                        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                          {faq.a}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* MANUAL PANEL */}
          {activeTab === 'manual' && (
            <div className="space-y-6">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-indigo-300">AMC 主理人核心上手流程</h2>
                <p className="text-xs text-slate-400 mt-1">按照以下三个主要步骤，建立安全、持久且高度协同的人机运作轨道。</p>
              </div>

              <div className="relative pl-6 sm:pl-8 border-l border-slate-800 space-y-8 py-2">
                {steps.map((step, idx) => (
                  <div key={idx} className="relative">
                    {/* Stepper Dot with Number */}
                    <div className="absolute -left-[38px] sm:-left-[46px] top-0.5 flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-slate-950 border border-indigo-500 text-xs sm:text-sm font-bold text-indigo-300 shadow-md">
                      {step.num}
                    </div>

                    <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 hover:border-indigo-500/30 transition-all duration-300">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <h3 className="font-bold text-base sm:text-lg text-slate-100 flex items-center gap-2">
                          {step.title}
                        </h3>
                        <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/20">
                          {step.badge}
                        </span>
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SKILL MARKET PANEL */}
          {activeTab === 'skills' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-indigo-300">AI 员工能力插件与技能池</h2>
                <p className="text-xs text-slate-400 mt-1">AMC 虚拟员工出厂内置的多维度能力模板，根据品牌业务需求自由授权和配置。</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {skills.map((skill, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 flex flex-col justify-between hover:border-indigo-500/30 transition-all duration-300"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{skill.icon}</span>
                          <h3 className="font-bold text-sm sm:text-base text-slate-100">
                            {skill.title}
                          </h3>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
                            skill.status === 'Active'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {skill.statusLabel}
                        </span>
                      </div>
                      
                      <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                        {skill.desc}
                      </p>

                      {/* Capabilities Bullets */}
                      <div className="space-y-1.5 border-t border-slate-800/50 pt-3 mb-4">
                        <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-bold">技能细分</span>
                        {skill.features.map((feat, fIdx) => (
                          <div key={fIdx} className="flex items-center gap-2 text-xs text-slate-400">
                            <CheckCircle2 size={12} className="text-indigo-400 shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button className="w-full mt-2 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors">
                      {skill.status === 'Active' ? '配置详情' : '启用技能'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AMC SCHOOL PANEL */}
          {activeTab === 'school' && (
            <div className="space-y-6">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-indigo-300">进阶人机协同与流量课程</h2>
                <p className="text-xs text-slate-400 mt-1">解锁高阶操作，学习如何通过本地生活 O2O 闭环实现店铺裂变增长。</p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {courses.map((course, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:border-indigo-500/30 transition-all duration-300"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <PlayCircle size={18} className="text-indigo-400" />
                        <h3 className="font-bold text-base text-slate-100">{course.title}</h3>
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed max-w-3xl">
                        {course.desc}
                      </p>
                      
                      {/* Meta & Progress */}
                      <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap pt-1">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {course.duration}
                        </span>
                        
                        {/* Progress Bar */}
                        <div className="flex items-center gap-2">
                          <span>进度: {course.progress}%</span>
                          <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{ width: `${course.progress}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button className="flex items-center gap-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition-colors cursor-pointer shrink-0 self-end sm:self-auto">
                      {course.btnLabel} <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </section>

        {/* Security Warning Section */}
        <section className="mt-12 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-5">
          <h3 className="font-semibold text-sm sm:text-base text-indigo-300 flex items-center gap-2">
            🛡️ 运营安全与数据隐私提示
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            AMC 系统中所有 AI 虚拟员工的数据均存储于隔离的 Sandbox 环境中。发帖操作、素材上传皆遵循 Zero Local Cache 原则，绝不会缓存您门店前台敏感数据或主理人的社交平台个人凭证。请在本地前台运行时保持 Tunnel 插件的在线状态。
          </p>
        </section>

      </div>
    </main>
  )
}
