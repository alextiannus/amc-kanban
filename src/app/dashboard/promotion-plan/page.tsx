'use client'

import React, { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  Download,
  Edit3,
  Save,
  UploadCloud,
  Orbit,
  Rocket,
  Sparkles,
  Telescope,
  WandSparkles,
} from 'lucide-react'

type Phase = 'editing' | 'generating' | 'result' | 'saved' | 'uploaded'

type SignalKind = 'growth' | 'content' | 'market'

type Signal = {
  id: string
  kind: SignalKind
  label: string
  summary: string
  x: number
  y: number
  size: number
  depth: number
  delay: number
}

const signals: Signal[] = [
  {
    id: 'growth-1',
    kind: 'growth',
    label: '竞品声量',
    summary: '附近同类餐厅集中推聚餐场景，午晚餐转化强。',
    x: 13,
    y: 23,
    size: 15,
    depth: 1.1,
    delay: 0,
  },
  {
    id: 'growth-2',
    kind: 'growth',
    label: '品牌故事',
    summary: '东北家常菜、分量感和朋友聚会是最稳定记忆点。',
    x: 72,
    y: 18,
    size: 18,
    depth: 1.25,
    delay: 0.12,
  },
  {
    id: 'growth-3',
    kind: 'growth',
    label: '增长缺口',
    summary: '曝光内容够多，强转化和复购内容需要补齐。',
    x: 84,
    y: 57,
    size: 13,
    depth: 0.9,
    delay: 0.22,
  },
  {
    id: 'content-1',
    kind: 'content',
    label: '爆款结构',
    summary: '先给桌面冲击，再拆菜品、人数、价格和预订路径。',
    x: 24,
    y: 66,
    size: 19,
    depth: 1.35,
    delay: 0.06,
  },
  {
    id: 'content-2',
    kind: 'content',
    label: '短视频 idea',
    summary: '“3-4 人下班聚餐不用纠结，直接点这一桌”。',
    x: 62,
    y: 72,
    size: 17,
    depth: 1.2,
    delay: 0.18,
  },
  {
    id: 'content-3',
    kind: 'content',
    label: '内容打法',
    summary: '本周用品牌故事、招牌菜种草、套餐转化交替推进。',
    x: 43,
    y: 14,
    size: 14,
    depth: 0.95,
    delay: 0.3,
  },
  {
    id: 'content-4',
    kind: 'content',
    label: '画面 idea',
    summary: '第一秒只拍一筷子夹起的热菜，让食欲先于广告出现。',
    x: 18,
    y: 82,
    size: 13,
    depth: 1.05,
    delay: 0.48,
  },
  {
    id: 'content-5',
    kind: 'content',
    label: '复购 idea',
    summary: '用“这家适合下次带朋友来”承接月底复购内容。',
    x: 77,
    y: 81,
    size: 16,
    depth: 1.18,
    delay: 0.58,
  },
  {
    id: 'content-6',
    kind: 'content',
    label: '场景脚本',
    summary: '从“几个人吃饭”切入，再落到套餐或招牌菜推荐。',
    x: 33,
    y: 33,
    size: 12,
    depth: 0.92,
    delay: 0.68,
  },
  {
    id: 'content-7',
    kind: 'content',
    label: '评论引导',
    summary: '结尾问“你会带几个人来吃这一桌？”提升互动。',
    x: 86,
    y: 73,
    size: 11,
    depth: 0.9,
    delay: 0.78,
  },
  {
    id: 'market-1',
    kind: 'market',
    label: '消费场景',
    summary: '家庭聚餐、朋友聚会、下班小聚是核心场景。',
    x: 8,
    y: 48,
    size: 12,
    depth: 0.85,
    delay: 0.38,
  },
  {
    id: 'market-2',
    kind: 'market',
    label: '素材缺口',
    summary: '需要补门头、整桌俯拍、人物夹菜和老板出镜。',
    x: 91,
    y: 31,
    size: 16,
    depth: 1.15,
    delay: 0.44,
  },
  {
    id: 'growth-4',
    kind: 'growth',
    label: '竞品内容',
    summary: '同区账号高频使用“朋友聚餐”和“隐藏好店”作为入口。',
    x: 56,
    y: 25,
    size: 12,
    depth: 0.9,
    delay: 0.88,
  },
  {
    id: 'market-3',
    kind: 'market',
    label: '拍摄机会',
    summary: '晚餐高峰、上菜瞬间、多人分享是最容易出片的时段。',
    x: 6,
    y: 72,
    size: 14,
    depth: 1.04,
    delay: 0.98,
  },
]

const backgroundStars = Array.from({ length: 124 }, (_, index) => ({
  id: `star-${index}`,
  x: (index * 37) % 100,
  y: (index * 61 + 11) % 100,
  size: 1 + (index % 4),
  delay: (index % 11) * 0.16,
  opacity: 0.35 + (index % 5) * 0.11,
}))

const ideaBursts = [
  '老板出镜讲一道菜的来历',
  '下班聚餐不用纠结点什么',
  '整桌俯拍先给分量冲击',
  '用门店烟火气降低广告感',
  '招牌菜热气和夹菜特写',
  '朋友碰杯镜头承接转化',
  '套餐只是其中一个转化节点',
  '月底用老客复购内容收口',
  '对比同商圈聚餐选择',
  '把卖点翻译成顾客场景',
  '做一条评论区互动问题',
  '补拍门头和地址路径',
  '用老板一句话解释为什么这道菜值得点',
  '把“分量足”拍成桌面被摆满的过程',
  '先做品牌记忆，再让套餐负责短期转化',
  '让顾客从“今晚吃什么”自然进入门店',
  '用一条 Reels 做门店环境和招牌菜混剪',
  '把竞品热门 hook 改写成商家自有表达',
  '生成一条适合 Google Business 的门店动态',
  '拆出本周三条不同卖点组合',
  '把家庭聚餐和朋友聚餐分成两条内容',
  '为下一次拍摄自动列出缺失镜头',
  '根据人工修改更新灵感库权重',
  '从评论问题反推下一条内容选题',
]

const resultPosts = [
  {
    day: 'Day 1',
    title: '品牌记忆开场',
    points: '东北家常菜 / 分量感',
    tactic: '品牌故事型',
  },
  {
    day: 'Day 5',
    title: '招牌菜细节种草',
    points: '招牌菜 / 热气 / 口感',
    tactic: '产品种草型',
  },
  {
    day: 'Day 10',
    title: '朋友聚餐场景',
    points: '多人聚餐 / 桌面冲击',
    tactic: '消费场景型',
  },
  {
    day: 'Day 16',
    title: '128 套餐强转化',
    points: '价格 / 份量 / 人数',
    tactic: '团购套餐型',
  },
  {
    day: 'Day 23',
    title: '老客复购提醒',
    points: '熟悉味道 / 聚会理由',
    tactic: '复购经营型',
  },
]

const assetRequirementText = `东北餐厅 30 天推广计划 - 素材采集需求

1. 门店基础素材
- 门头横拍和竖拍各 1 条，包含完整招牌
- 从附近地标走到门店的 5-8 秒路径镜头
- 店内环境广角，覆盖适合聚餐的桌位

2. 招牌菜素材
- 每道招牌菜 3 个镜头：上桌、夹起、近景质感
- 热气、汤汁、翻炒、摆盘等细节镜头
- 整桌套餐俯拍，体现分量和丰富度

3. 人物与场景素材
- 朋友聚餐夹菜、碰杯、聊天镜头
- 家庭/多人共享一桌的自然用餐画面
- 老板或员工出镜，讲 1 句招牌菜故事

4. 套餐转化素材
- 128 套餐完整桌面展示
- 菜品逐个入镜，方便后期做套餐拆解
- 价格、地址、预订路径所需确认信息

5. 缺口提醒
- 如果价格、有效期、套餐内容未确认，不生成确定性字幕
- 如果没有人物授权，人物镜头只用于内部参考`

function signalColor(kind: SignalKind) {
  if (kind === 'growth') return 'from-cyan-200 via-sky-300 to-blue-500'
  if (kind === 'content') return 'from-amber-100 via-fuchsia-200 to-pink-500'
  return 'from-emerald-100 via-teal-200 to-cyan-500'
}

function signalLabel(kind: SignalKind) {
  if (kind === 'growth') return 'amc-growth'
  if (kind === 'content') return 'amc-content'
  return 'market'
}

export default function PromotionPlanNebulaPage() {
  const [phase, setPhase] = useState<Phase>('editing')
  const [goal, setGoal] = useState(
    '未来 30 天希望提升品牌认知和到店转化。重点推广东北家常菜、朋友聚餐场景、128 新套餐，并避免整个月都只做团购广告。',
  )
  const [sellingPoints, setSellingPoints] = useState(
    '核心卖点：分量足、适合多人聚餐、招牌菜有记忆点、门店有烟火气、套餐适合短期转化。',
  )

  const isGenerating = phase === 'generating'
  const isResult = phase === 'result' || phase === 'saved' || phase === 'uploaded'
  const isSaved = phase === 'saved'
  const isUploaded = phase === 'uploaded'

  const centerCopy = useMemo(() => {
    if (phase === 'editing') return '确认推广目标后，星空会开始收束并生成计划'
    if (phase === 'generating') return '正在吸收品牌特征、竞品信号和内容创意'
    if (phase === 'saved') return '推广计划已保存，可在品牌故事页随时读取'
    if (phase === 'uploaded') return '素材已上传，推广计划已加入发布日历'
    return '30 天推广计划已生成'
  }, [phase])

  function startGeneration() {
    if (phase !== 'editing') return
    setPhase('generating')
    window.setTimeout(() => setPhase('result'), 5200)
  }

  function reset() {
    setPhase('editing')
  }

  function savePlan() {
    setPhase('saved')
  }

  function handleMaterialUpload() {
    setPhase('uploaded')
  }

  return (
    <main className={`nebulaPage ${phase}`}>
      <div className="nightGradient" />
      <div className="auroraLayer" />
      <div className="vignette" />

      {backgroundStars.map((star) => (
        <span
          key={star.id}
          className="backgroundStar"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}

      {signals.map((signal) => (
        <article
          key={signal.id}
          className={`signalStar ${signal.kind} ${isGenerating ? 'collapse' : ''} ${isResult ? 'reborn' : ''}`}
          style={{
            left: `${signal.x}%`,
            top: `${signal.y}%`,
            ['--star-size' as string]: `${signal.size * signal.depth}px`,
            ['--delay' as string]: `${signal.delay}s`,
          }}
        >
          <div className={`starCore bg-gradient-to-br ${signalColor(signal.kind)}`} />
          <div className="signalCard">
            <span>{signalLabel(signal.kind)}</span>
            <strong>{signal.label}</strong>
            <p>{signal.summary}</p>
          </div>
        </article>
      ))}

      {isGenerating && (
        <div className="incomingField" aria-hidden>
          {Array.from({ length: 38 }, (_, index) => (
            <span
              key={index}
              style={{
                left: `${(index * 29 + 7) % 100}%`,
                top: `${(index * 43 + 19) % 100}%`,
                animationDelay: `${index * 0.08}s`,
              }}
            />
          ))}
        </div>
      )}

      {isGenerating && (
        <div className="ideaStream" aria-hidden>
          {ideaBursts.map((idea, index) => (
            <div
              key={idea}
              className="ideaComet"
              style={{
                left: `${(index * 23 + 6) % 92}%`,
                top: `${(index * 31 + 12) % 88}%`,
                animationDelay: `${index * 0.28}s`,
              }}
            >
              <Sparkles size={12} />
              {idea}
            </div>
          ))}
        </div>
      )}

      <header className="topBar">
        <a href="/dashboard" className="backLink">
          <ArrowLeft size={16} />
          返回品牌故事
        </a>
        <div className="systemPill">
          <Orbit size={15} />
          Promotion Plan Nebula
        </div>
      </header>

      <section className={`controlCore ${phase}`}>
        <div className="blackHoleRing ringOne" />
        <div className="blackHoleRing ringTwo" />
        {isGenerating && (
          <>
            <div className="singularityStar" />
            <div className="finalFlare" />
          </>
        )}
        <div className="corePanel">
          <div className="coreHeader">
            <div>
              <span>{centerCopy}</span>
              <h2>
                {isUploaded
                  ? '已加入发布日历'
                  : isSaved
                    ? '计划已保存'
                    : isResult
                      ? '推广计划结果'
                      : '品牌推广目标与卖点'}
              </h2>
            </div>
            {isUploaded ? <CalendarCheck size={22} /> : isSaved ? <Save size={22} /> : <WandSparkles size={22} />}
          </div>

          {!isResult ? (
            <div className="editorStack">
              <label>
                <span>推广目标</span>
                <textarea value={goal} onChange={(event) => setGoal(event.target.value)} />
              </label>
              <label>
                <span>品牌卖点</span>
                <textarea value={sellingPoints} onChange={(event) => setSellingPoints(event.target.value)} />
              </label>
              <button className="generateButton" onClick={startGeneration} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Telescope size={18} />
                    正在生成推广计划
                  </>
                ) : (
                  <>
                    <Rocket size={18} />
                    确认并生成 30 天计划
                  </>
                )}
              </button>
            </div>
          ) : isSaved || isUploaded ? (
            <div className="confirmedPanel">
              <div className="successHalo">
                {isUploaded ? <CalendarCheck size={26} /> : <Save size={26} />}
              </div>
              <div className="confirmedCopy">
                <strong>{isUploaded ? '素材上传成功，计划已加入发布日历' : '推广计划已保存'}</strong>
                <p>
                  {isUploaded
                    ? '素材已完成上传，系统可以将对应发布任务加入发布日历，进入排期和审核流程。'
                    : '推广计划会保留在品牌故事页面，可随时读取、继续编辑或补充素材后再进入发布日历。'}
                </p>
              </div>
              <div className="assetRequirementBox">
                <div>
                  <span>
                    <ClipboardList size={16} />
                    素材采集需求
                  </span>
                  <p>包含门店、招牌菜、人物场景、套餐转化镜头和事实确认缺口。</p>
                </div>
                <a
                  className="downloadButton"
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(assetRequirementText)}`}
                  download="promotion-plan-asset-requirements.txt"
                >
                  <Download size={16} />
                  下载需求
                </a>
              </div>
              {!isUploaded && (
                <label className="uploadButton">
                  <UploadCloud size={16} />
                  上传素材
                  <input type="file" multiple accept="image/*,video/*" onChange={handleMaterialUpload} />
                </label>
              )}
              <button className="secondaryButton fullWidth" onClick={reset}>
                <Edit3 size={16} />
                返回重新调整
              </button>
            </div>
          ) : (
            <div className="resultPanel">
              <div className="resultSummary">
                <Sparkles size={18} />
                <p>
                  主线：先建立品牌记忆，再用招牌菜和消费场景种草，中段加入套餐转化，月底通过复购内容承接。
                </p>
              </div>
              <div className="postList">
                {resultPosts.map((post) => (
                  <div key={post.day} className="postItem">
                    <span>{post.day}</span>
                    <div>
                      <strong>{post.title}</strong>
                      <p>{post.points}</p>
                    </div>
                    <em>{post.tactic}</em>
                  </div>
                ))}
              </div>
              <div className="resultActions">
                <button className="secondaryButton" onClick={savePlan}>
                  <Save size={16} />
                  保存计划
                </button>
                <label className="confirmButton">
                  <UploadCloud size={16} />
                  上传素材
                  <input type="file" multiple accept="image/*,video/*" onChange={handleMaterialUpload} />
                </label>
                <a
                  className="downloadTextLink"
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(assetRequirementText)}`}
                  download="promotion-plan-asset-requirements.txt"
                >
                  <Download size={14} />
                  下载素材需求
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="legendPanel">
        <div>
          <span className="legendDot growth" />
          amc-growth 推广/竞品信息
        </div>
        <div>
          <span className="legendDot content" />
          amc-content 创意/灵感
        </div>
        <div>
          <span className="legendDot market" />
          品牌场景/素材信号
        </div>
      </aside>

      <style jsx>{`
        .nebulaPage {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          color: white;
          background: #03091f;
          font-family: var(--font-hanken-next), ui-sans-serif, system-ui, sans-serif;
        }

        .nightGradient,
        .auroraLayer,
        .vignette {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .nightGradient {
          background:
            radial-gradient(circle at 50% 45%, rgba(85, 56, 178, 0.34), transparent 22%),
            radial-gradient(circle at 18% 24%, rgba(20, 184, 166, 0.18), transparent 28%),
            radial-gradient(circle at 82% 30%, rgba(244, 114, 182, 0.15), transparent 24%),
            linear-gradient(180deg, #07153a 0%, #050b24 44%, #010412 100%);
        }

        .auroraLayer {
          opacity: 0.8;
          background:
            conic-gradient(from 115deg at 50% 48%, transparent, rgba(59, 130, 246, 0.22), transparent 28%),
            conic-gradient(from 245deg at 51% 48%, transparent, rgba(217, 70, 239, 0.18), transparent 30%);
          filter: blur(28px);
          animation: auroraBreathe 7s ease-in-out infinite alternate;
        }

        .vignette {
          background: radial-gradient(circle at 50% 48%, transparent 0%, transparent 38%, rgba(0, 0, 0, 0.62) 100%);
        }

        .backgroundStar {
          position: absolute;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 14px rgba(255, 255, 255, 0.8);
          animation: starTwinkle 3s ease-in-out infinite alternate;
        }

        .topBar {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px clamp(20px, 4vw, 48px);
        }

        .backLink,
        .systemPill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(191, 219, 254, 0.25);
          background: rgba(7, 16, 46, 0.52);
          color: rgba(226, 232, 240, 0.9);
          text-decoration: none;
          border-radius: 999px;
          padding: 9px 13px;
          font-size: 13px;
          backdrop-filter: blur(18px);
        }

        .heroCopy {
          position: relative;
          z-index: 8;
          width: min(560px, calc(100vw - 40px));
          margin-left: clamp(20px, 5vw, 70px);
          margin-top: 18px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #bae6fd;
          font-size: 13px;
          font-weight: 700;
        }

        h1 {
          margin: 12px 0 12px;
          font-family: var(--font-manrope-next), ui-sans-serif, system-ui, sans-serif;
          font-size: clamp(42px, 6vw, 82px);
          line-height: 0.95;
          letter-spacing: 0;
        }

        .heroCopy p {
          margin: 0;
          max-width: 520px;
          color: rgba(219, 234, 254, 0.72);
          font-size: 15px;
          line-height: 1.8;
        }

        .signalStar {
          position: absolute;
          z-index: 5;
          width: var(--star-size);
          height: var(--star-size);
          transform: translate(-50%, -50%);
          animation: drift 6s ease-in-out infinite alternate;
          animation-delay: var(--delay);
        }

        .starCore {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          box-shadow:
            0 0 18px rgba(255, 255, 255, 0.86),
            0 0 44px rgba(96, 165, 250, 0.54);
        }

        .signalCard {
          position: absolute;
          left: calc(100% + 12px);
          top: 50%;
          width: 190px;
          transform: translateY(-50%);
          border: 1px solid rgba(191, 219, 254, 0.18);
          border-radius: 16px;
          padding: 12px;
          background: rgba(8, 18, 46, 0.58);
          color: rgba(226, 232, 240, 0.92);
          backdrop-filter: blur(18px);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
          opacity: 0;
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .signalStar:hover .signalCard {
          opacity: 1;
          transform: translateY(-50%) translateX(4px);
        }

        .signalStar.content .signalCard {
          opacity: 0.82;
          transform: translateY(-50%) translateX(0);
        }

        .signalStar.content:hover .signalCard {
          opacity: 1;
          transform: translateY(-50%) translateX(4px);
        }

        .signalCard span {
          display: block;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .signalCard strong {
          display: block;
          margin-top: 5px;
          font-size: 14px;
        }

        .signalCard p {
          margin: 5px 0 0;
          color: rgba(226, 232, 240, 0.72);
          font-size: 12px;
          line-height: 1.45;
        }

        .signalStar.collapse {
          animation: collapseToCenter 4.8s cubic-bezier(0.76, 0, 0.24, 1) forwards;
          animation-delay: var(--delay);
        }

        .signalStar.collapse .signalCard {
          animation: signalCardAbsorb 1.45s ease forwards;
        }

        .signalStar.reborn {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0);
        }

        .incomingField span {
          position: absolute;
          z-index: 4;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #fef3c7;
          box-shadow: 0 0 24px rgba(253, 224, 71, 0.95);
          animation: incomingCollapse 2.2s cubic-bezier(0.76, 0, 0.24, 1) infinite;
        }

        .ideaStream {
          position: absolute;
          inset: 0;
          z-index: 6;
          pointer-events: none;
        }

        .ideaComet {
          position: absolute;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          max-width: 260px;
          border: 1px solid rgba(253, 224, 71, 0.25);
          border-radius: 999px;
          padding: 8px 12px;
          background: rgba(8, 13, 33, 0.66);
          box-shadow:
            0 0 24px rgba(217, 70, 239, 0.24),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          color: rgba(255, 251, 235, 0.92);
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          backdrop-filter: blur(14px);
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.7);
          animation: ideaToSingularity 3.2s cubic-bezier(0.76, 0, 0.24, 1) infinite;
        }

        .controlCore {
          position: absolute;
          z-index: 9;
          left: 50%;
          top: 52%;
          width: min(500px, calc(100vw - 34px));
          transform: translate(-50%, -50%);
        }

        .blackHoleRing {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 190px;
          height: 190px;
          border-radius: 999px;
          opacity: 0;
          pointer-events: none;
          transform: translate(-50%, -50%);
        }

        .singularityStar {
          position: absolute;
          z-index: 3;
          left: 50%;
          top: 50%;
          width: 104px;
          height: 104px;
          border-radius: 999px;
          background:
            radial-gradient(circle, #fff 0 12%, #fde68a 18%, #f0abfc 38%, #38bdf8 56%, transparent 72%);
          box-shadow:
            0 0 36px rgba(255, 255, 255, 0.95),
            0 0 90px rgba(56, 189, 248, 0.72),
            0 0 150px rgba(217, 70, 239, 0.52);
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.35);
          pointer-events: none;
          animation: starToBlackHole 5.45s cubic-bezier(0.76, 0, 0.24, 1) forwards;
        }

        .finalFlare {
          position: absolute;
          z-index: 12;
          left: 50%;
          top: 50%;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: white;
          opacity: 0;
          pointer-events: none;
          transform: translate(-50%, -50%) scale(0);
          box-shadow:
            0 0 40px rgba(255, 255, 255, 1),
            0 0 120px rgba(125, 211, 252, 0.96),
            0 0 220px rgba(244, 114, 182, 0.82);
          animation: finalFlareBurst 5.45s ease-in-out forwards;
        }

        .ringOne {
          border: 1px solid rgba(125, 211, 252, 0.35);
        }

        .ringTwo {
          width: 270px;
          height: 270px;
          border: 1px solid rgba(244, 114, 182, 0.25);
        }

        .controlCore.generating .blackHoleRing {
          opacity: 1;
          animation: ringCollapse 1.25s ease-in-out infinite;
        }

        .controlCore.generating .ringTwo {
          animation-delay: 0.32s;
        }

        .corePanel {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(191, 219, 254, 0.22);
          border-radius: 28px;
          padding: clamp(18px, 3vw, 28px);
          background:
            linear-gradient(145deg, rgba(15, 23, 42, 0.86), rgba(17, 24, 39, 0.64)),
            radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.28), transparent 42%);
          box-shadow:
            0 30px 100px rgba(0, 0, 0, 0.55),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(24px);
          transition: transform 600ms ease, border-color 600ms ease;
        }

        .controlCore.generating .corePanel {
          transform-origin: center center;
          border-color: rgba(15, 23, 42, 0.3);
          animation: panelCollapseToStar 5.45s cubic-bezier(0.76, 0, 0.24, 1) forwards;
        }

        .controlCore.result .corePanel {
          animation: resultBirth 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .coreHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .coreHeader span {
          color: #bae6fd;
          font-size: 12px;
          font-weight: 800;
        }

        .coreHeader h2 {
          margin: 5px 0 0;
          font-family: var(--font-manrope-next), ui-sans-serif, system-ui, sans-serif;
          font-size: clamp(20px, 2.5vw, 28px);
          letter-spacing: 0;
        }

        .editorStack {
          display: grid;
          gap: 14px;
        }

        label span {
          display: block;
          margin-bottom: 7px;
          color: rgba(226, 232, 240, 0.72);
          font-size: 12px;
          font-weight: 800;
        }

        textarea {
          width: 100%;
          min-height: 72px;
          resize: vertical;
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 15px;
          padding: 12px;
          outline: none;
          background: rgba(2, 6, 23, 0.52);
          color: white;
          font-size: 13px;
          line-height: 1.55;
        }

        textarea:focus {
          border-color: rgba(125, 211, 252, 0.62);
          box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.13);
        }

        .generateButton,
        .confirmButton,
        .secondaryButton,
        .downloadButton,
        .uploadButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 16px;
          min-height: 48px;
          padding: 0 18px;
          color: white;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
        }

        .confirmButton input,
        .uploadButton input {
          display: none;
        }

        .generateButton {
          background: linear-gradient(135deg, #38bdf8, #6366f1 48%, #d946ef);
          box-shadow: 0 18px 55px rgba(99, 102, 241, 0.34);
        }

        .generateButton:disabled {
          cursor: wait;
          opacity: 0.82;
        }

        .resultPanel {
          display: grid;
          gap: 16px;
        }

        .confirmedPanel {
          display: grid;
          justify-items: center;
          gap: 16px;
          text-align: center;
          animation: resultBirth 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .successHalo {
          display: grid;
          place-items: center;
          width: 74px;
          height: 74px;
          border-radius: 999px;
          background:
            radial-gradient(circle, rgba(255, 255, 255, 0.98), rgba(125, 211, 252, 0.8) 34%, rgba(34, 197, 94, 0.3) 58%, transparent 72%);
          color: #022c22;
          box-shadow:
            0 0 42px rgba(125, 211, 252, 0.9),
            0 0 120px rgba(34, 197, 94, 0.44);
        }

        .confirmedCopy strong {
          display: block;
          color: white;
          font-size: 20px;
          font-weight: 950;
        }

        .confirmedCopy p {
          max-width: 390px;
          margin: 8px 0 0;
          color: rgba(226, 232, 240, 0.72);
          font-size: 13px;
          line-height: 1.65;
        }

        .assetRequirementBox {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          width: 100%;
          border: 1px solid rgba(125, 211, 252, 0.22);
          border-radius: 18px;
          padding: 14px;
          background: rgba(8, 47, 73, 0.28);
          text-align: left;
        }

        .assetRequirementBox span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #bae6fd;
          font-size: 13px;
          font-weight: 900;
        }

        .assetRequirementBox p {
          margin: 5px 0 0;
          color: rgba(226, 232, 240, 0.62);
          font-size: 12px;
          line-height: 1.5;
        }

        .downloadButton {
          min-height: 42px;
          border-radius: 14px;
          background: linear-gradient(135deg, #38bdf8, #14b8a6);
          white-space: nowrap;
          box-shadow: 0 14px 38px rgba(20, 184, 166, 0.24);
        }

        .uploadButton {
          width: 100%;
          min-height: 48px;
          background: linear-gradient(135deg, #6366f1, #d946ef);
          box-shadow: 0 16px 42px rgba(99, 102, 241, 0.24);
        }

        .resultSummary {
          display: flex;
          gap: 11px;
          border: 1px solid rgba(125, 211, 252, 0.18);
          border-radius: 18px;
          padding: 14px;
          background: rgba(8, 47, 73, 0.32);
        }

        .resultSummary p {
          margin: 0;
          color: rgba(226, 232, 240, 0.84);
          font-size: 14px;
          line-height: 1.6;
        }

        .postList {
          display: grid;
          gap: 10px;
        }

        .postItem {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 16px;
          padding: 12px;
          background: rgba(15, 23, 42, 0.58);
        }

        .postItem span {
          color: #67e8f9;
          font-size: 12px;
          font-weight: 900;
        }

        .postItem strong {
          display: block;
          font-size: 14px;
        }

        .postItem p {
          margin: 3px 0 0;
          color: rgba(226, 232, 240, 0.6);
          font-size: 12px;
        }

        .postItem em {
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(217, 70, 239, 0.18);
          color: #f5d0fe;
          font-size: 12px;
          font-style: normal;
          font-weight: 800;
        }

        .resultActions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .secondaryButton {
          border: 1px solid rgba(191, 219, 254, 0.2);
          background: rgba(15, 23, 42, 0.78);
        }

        .fullWidth {
          width: 100%;
        }

        .confirmButton {
          background: linear-gradient(135deg, #22c55e, #14b8a6, #38bdf8);
        }

        .downloadTextLink {
          grid-column: 1 / -1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: #bae6fd;
          font-size: 13px;
          font-weight: 900;
          text-decoration: none;
          min-height: 32px;
        }

        .downloadTextLink:hover {
          color: white;
        }

        .legendPanel {
          position: absolute;
          z-index: 8;
          right: clamp(18px, 4vw, 46px);
          bottom: 30px;
          display: grid;
          gap: 10px;
          border: 1px solid rgba(191, 219, 254, 0.18);
          border-radius: 20px;
          padding: 14px;
          background: rgba(7, 16, 46, 0.52);
          color: rgba(226, 232, 240, 0.78);
          font-size: 12px;
          font-weight: 700;
          backdrop-filter: blur(18px);
        }

        .legendPanel div {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .legendDot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          box-shadow: 0 0 16px currentColor;
        }

        .legendDot.growth {
          background: #38bdf8;
          color: #38bdf8;
        }

        .legendDot.content {
          background: #f0abfc;
          color: #f0abfc;
        }

        .legendDot.market {
          background: #5eead4;
          color: #5eead4;
        }

        @keyframes starTwinkle {
          from {
            transform: scale(0.7);
          }
          to {
            transform: scale(1.35);
          }
        }

        @keyframes auroraBreathe {
          from {
            transform: scale(1) rotate(0deg);
          }
          to {
            transform: scale(1.08) rotate(3deg);
          }
        }

        @keyframes drift {
          from {
            transform: translate(-50%, -50%) translate3d(-6px, 3px, 0);
          }
          to {
            transform: translate(-50%, -50%) translate3d(7px, -5px, 0);
          }
        }

        @keyframes collapseToCenter {
          0% {
            opacity: 1;
            filter: blur(0);
          }
          18% {
            opacity: 1;
            filter: blur(0);
          }
          64% {
            opacity: 1;
            filter: blur(1px);
          }
          100% {
            left: 50%;
            top: 52%;
            opacity: 0;
            filter: blur(8px);
            transform: translate(-50%, -50%) scale(0.04) rotate(520deg);
          }
        }

        @keyframes signalCardAbsorb {
          0% {
            opacity: 0.82;
            transform: translateY(-50%) translateX(0);
          }
          55% {
            opacity: 0.35;
            transform: translateY(-50%) translateX(-8px) scale(0.92);
          }
          100% {
            opacity: 0;
            transform: translateY(-50%) translateX(-20px) scale(0.72);
          }
        }

        @keyframes incomingCollapse {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          18% {
            opacity: 1;
          }
          72% {
            opacity: 1;
          }
          100% {
            left: 50%;
            top: 52%;
            opacity: 0;
            transform: scale(0.05) rotate(320deg);
          }
        }

        @keyframes ideaToSingularity {
          0% {
            opacity: 0;
            filter: blur(4px);
            transform: translate(-50%, -50%) scale(0.7);
          }
          18% {
            opacity: 1;
            filter: blur(0);
          }
          66% {
            opacity: 1;
          }
          100% {
            left: 50%;
            top: 52%;
            opacity: 0;
            filter: blur(8px);
            transform: translate(-50%, -50%) scale(0.08) rotate(28deg);
          }
        }

        @keyframes ringCollapse {
          0% {
            transform: translate(-50%, -50%) scale(1.4) rotate(0deg);
            opacity: 0;
          }
          35% {
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.18) rotate(180deg);
            opacity: 0;
          }
        }

        @keyframes blackHolePulse {
          from {
            box-shadow:
              0 30px 120px rgba(0, 0, 0, 0.78),
              0 0 0 0 rgba(14, 165, 233, 0.18);
          }
          to {
            box-shadow:
              0 38px 140px rgba(0, 0, 0, 0.92),
              0 0 90px 14px rgba(88, 28, 135, 0.42);
          }
        }

        @keyframes panelCollapseToStar {
          0% {
            opacity: 1;
            border-radius: 28px;
            transform: scale(1);
            filter: blur(0);
          }
          24% {
            opacity: 0.95;
            border-radius: 999px;
            transform: scale(0.5);
            filter: blur(1px);
          }
          38% {
            opacity: 0;
            border-radius: 999px;
            transform: scale(0.13) rotate(28deg);
            filter: blur(10px);
          }
          100% {
            opacity: 0;
            border-radius: 999px;
            transform: scale(0.03) rotate(360deg);
            filter: blur(18px);
          }
        }

        @keyframes starToBlackHole {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
            filter: blur(4px);
          }
          18% {
            opacity: 0;
          }
          30% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.05);
            filter: blur(0);
          }
          62% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.72) rotate(180deg);
            background:
              radial-gradient(circle, #020617 0 18%, #111827 30%, #7c3aed 42%, #38bdf8 58%, transparent 72%);
            box-shadow:
              0 0 28px rgba(2, 6, 23, 1),
              0 0 90px rgba(124, 58, 237, 0.72),
              0 0 150px rgba(14, 165, 233, 0.58);
          }
          84% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.18) rotate(720deg);
            filter: blur(2px);
          }
          92% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.02) rotate(920deg);
            filter: blur(12px);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
          }
        }

        @keyframes finalFlareBurst {
          0%,
          76% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0);
          }
          86% {
            opacity: 0.95;
            transform: translate(-50%, -50%) scale(20);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(34);
          }
        }

        @keyframes resultBirth {
          from {
            opacity: 0;
            transform: scale(0.34);
            filter: blur(18px) brightness(1.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }

        @media (max-width: 760px) {
          .topBar {
            align-items: flex-start;
            flex-direction: column;
            gap: 10px;
          }

          .heroCopy {
            margin-top: 8px;
          }

          .controlCore {
            position: relative;
            left: auto;
            top: auto;
            width: calc(100vw - 28px);
            margin: 34px auto 110px;
            transform: none;
          }

          .signalCard {
            display: none;
          }

          .legendPanel {
            left: 14px;
            right: 14px;
            bottom: 14px;
          }

          .postItem {
            grid-template-columns: 54px minmax(0, 1fr);
          }

          .postItem em {
            grid-column: 2;
            justify-self: start;
          }

          .assetRequirementBox {
            grid-template-columns: 1fr;
          }

          .downloadButton {
            width: 100%;
          }

          .resultActions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  )
}
