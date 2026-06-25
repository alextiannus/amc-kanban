'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  Sparkles, Mic, Image as ImageIcon, Calendar as CalendarIcon, 
  ShoppingBag, Trash2, CheckCircle2, AlertCircle, Plus, 
  Send, RefreshCw, Layers, ShieldCheck, ChevronDown, Check,
  Play, BarChart2, Star, Video, Link, ArrowRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Brand {
  id: string
  name: string
  description?: string | null
  location?: string | null
  autoPilot: boolean
}

interface MediaAsset {
  id: string
  url: string
  filename?: string | null
  aiCategory?: string | null
  aiCaption?: string | null
  aiTags: string[]
}

interface ContentDraft {
  id: string
  caption: string
  mediaUrls: string[]
  scheduledAt?: string | null
  status: string
  platform: string
}

export default function BrandOwnerDashboard() {
  // --- States ---
  const [brands, setBrands] = useState<Brand[]>([])
  const [activeBrand, setActiveBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Sub-pages overlay view state
  const [activeSubPage, setActiveSubPage] = useState<'calendar' | 'market' | 'assets' | 'settings' | null>(null)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [showMapsAlert, setShowMapsAlert] = useState(true)
  const [showScheduleAlert, setShowScheduleAlert] = useState(true)
  const [notificationsExpanded, setNotificationsExpanded] = useState(false)
  
  // Companion Chat state
  const [messages, setMessages] = useState<{ sender: 'ai' | 'user'; text: string; time: string }[]>([
    { sender: 'ai', text: 'Chef, I am optimizing your Friday dinner campaigns. 1 draft is ready for review.', time: '13:00' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [companionState, setCompanionState] = useState<'idle' | 'listening' | 'thinking'>('idle')

  // Assets upload state
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drafts & Weekly feed state
  const [drafts, setDrafts] = useState<ContentDraft[]>([])
  const [selectedDay, setSelectedDay] = useState(new Date().getDate())

  // Marketplace & Subscription state
  const [addons, setAddons] = useState({ veo3: true, dubco: true })
  const [updatingAddons, setUpdatingAddons] = useState(false)

  // Dropdown states
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // --- Fetch Brand Data ---
  useEffect(() => {
    async function loadInitialData() {
      try {
        const res = await fetch('/api/brands')
        if (res.ok) {
          const list = await res.json()
          setBrands(list)
          if (list.length > 0) {
            // Read active brand from local storage if available
            const savedId = localStorage.getItem('dashboard.activeBrandId')
            const found = list.find((b: any) => b.id === savedId) || list[0]
            setActiveBrand(found)
          }
        }
      } catch (err) {
        console.error('Failed to load brands:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [])

  // --- Load Assets & Drafts for Active Brand ---
  useEffect(() => {
    if (!activeBrand) return
    const currentBrandId = activeBrand.id
    localStorage.setItem('dashboard.activeBrandId', currentBrandId)
    
    async function loadBrandDetails(id: string) {
      try {
        // Fetch drafts
        const draftsRes = await fetch(`/api/brands/${id}/drafts`)
        if (draftsRes.ok) {
          const resData = await draftsRes.json()
          setDrafts(Array.isArray(resData) ? resData : resData.drafts || [])
        }
        
        // Fetch assets
        const assetsRes = await fetch(`/api/brands/${id}/assets`)
        if (assetsRes.ok) {
          const data = await assetsRes.json()
          setAssets(data)
        }
      } catch (err) {
        console.error('Failed to load brand details:', err)
      }
    }
    loadBrandDetails(currentBrandId)
  }, [activeBrand])

  // --- Companion WebGL Shaders render effect ---
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (activeSubPage !== null) return
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return

    let animationId: number
    const vs = `
      attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `
    // Shaders change based on companionState (idle, listening, thinking)
    const getFS = (state: 'idle' | 'listening' | 'thinking') => {
      let speed = '0.8'
      let noiseScale = '5.0'
      let pulseAmp = '0.15'
      let baseGlow = '3.5'
      
      if (state === 'listening') {
        speed = '2.2'
        noiseScale = '12.0'
        pulseAmp = '0.25'
        baseGlow = '2.8'
      } else if (state === 'thinking') {
        speed = '1.4'
        noiseScale = '8.0'
        pulseAmp = '0.1'
        baseGlow = '4.5'
      }

      return `
        precision highp float;
        varying vec2 v_texCoord;
        uniform float u_time;
        uniform vec2 u_resolution;

        void main() {
          vec2 uv = v_texCoord;
          float t = u_time * ${speed};
          
          vec2 p = (uv - 0.5) * 2.0;
          float len = length(p);
          
          // Emerald Green if listening, Orange-Yellow if thinking, Indigo if idle
          vec3 color = vec3(0.275, 0.282, 0.831); // #4648d4
          if (${state === 'listening'}) {
            color = vec3(0.0, 0.424, 0.286); // success-emerald
          } else if (${state === 'thinking'}) {
            color = vec3(0.988, 0.729, 0.4); // tertiary-dim / orange-gold
          }
          
          float pulse = sin(t) * ${pulseAmp} + 0.85;
          float ring = smoothstep(0.4 * pulse, 0.41 * pulse, len) - smoothstep(0.45 * pulse, 0.46 * pulse, len);
          
          float glow = exp(-len * ${baseGlow}) * pulse;
          
          float angle = atan(p.y, p.x);
          float strands = sin(angle * ${noiseScale} + t * 2.0) * 0.1;
          float strandGlow = smoothstep(0.35, 0.4, len + strands) * smoothstep(0.45, 0.4, len + strands);
          
          vec3 finalColor = color * (glow + ring * 1.5 + strandGlow * 0.8);
          
          float aura = smoothstep(0.8, 0.2, len) * 0.2;
          finalColor += color * aura;
          
          gl_FragColor = vec4(finalColor, clamp(len < 0.9 ? 1.0 : 0.0, 0.0, 1.0));
        }
      `
    }

    const compileShader = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }

    let program = gl.createProgram()!
    const initShaders = () => {
      gl.deleteProgram(program)
      program = gl.createProgram()!
      gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vs))
      gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, getFS(companionState)))
      gl.linkProgram(program)
      gl.useProgram(program)

      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
      const pos = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(pos)
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    }

    initShaders()

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uRes = gl.getUniformLocation(program, 'u_resolution')

    const syncSize = () => {
      const w = canvas.clientWidth || 128
      const h = canvas.clientHeight || 128
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    syncSize()

    const render = (time: number) => {
      syncSize()
      if (uTime) gl.uniform1f(uTime, time * 0.001)
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationId = requestAnimationFrame(render)
    }
    render(0)

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [companionState, activeSubPage])

  // --- Voice Assist Activation ---
  const startVoiceAssist = () => {
    if (companionState === 'idle') {
      setCompanionState('listening')
      showToast('Companion is listening to voice input...', 'info')
      setTimeout(() => {
        setCompanionState('thinking')
        setTimeout(() => {
          setCompanionState('idle')
          const mockReplies = [
            'Understood, Chef. I am updating our brand context dictionary to prioritize local organic ingredients.',
            'Got it! Generating a new Instagram post draft featuring our fresh Xiaolongbao.',
            'Okay, checking our weekly performance ROI. Dub.co link tracks indicate a 14% click spike today!'
          ]
          const randomReply = mockReplies[Math.floor(Math.random() * mockReplies.length)]
          setMessages(prev => [
            ...prev, 
            { sender: 'user', text: '[Voice Input Recorded]', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
            { sender: 'ai', text: randomReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
          ])
        }, 2000)
      }, 3000)
    } else {
      setCompanionState('idle')
    }
  }

  // --- Chat Input Submission ---
  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    const text = chatInput.trim()
    setChatInput('')
    setMessages(prev => [...prev, { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    setCompanionState('thinking')

    setTimeout(() => {
      setCompanionState('idle')
      let reply = `I've noted that! I will apply it to optimize our next campaigns for ${activeBrand?.name}.`
      if (text.toLowerCase().includes('post') || text.toLowerCase().includes('generate') || text.toLowerCase().includes('创')) {
        reply = 'Sure! I have generated a new draft draft for your review. Take a look in your calendar planner.'
      } else if (text.toLowerCase().includes('menu') || text.toLowerCase().includes('菜')) {
        reply = 'Brand menu assets synced successfully. I will include the new prices and items in our next copywriting prompts.'
      }
      setMessages(prev => [...prev, { sender: 'ai', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    }, 1500)
  }

  // --- Quick Upload Photos ---
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeBrand) return
    setUploading(true)
    const files = Array.from(e.target.files) as File[]
    showToast(`Uploading ${files.length} fresh assets...`, 'info')

    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        
        const res = await fetch(`/api/brands/${activeBrand.id}/assets`, {
          method: 'POST',
          body: formData
        })
        
        if (res.ok) {
          const newAsset = await res.json()
          setAssets(prev => [newAsset, ...prev])
        }
      }
      showToast('Assets uploaded and auto-tagged by AI!')
    } catch (err) {
      console.error('Upload failed:', err)
      showToast('Upload failed, saved as offline mock asset', 'error')
      // Fallback offline mock asset
      const mockAsset: MediaAsset = {
        id: Math.random().toString(),
        url: URL.createObjectURL(files[0]),
        filename: files[0].name,
        aiCategory: 'Dish',
        aiTags: ['Fresh', 'Yummy', 'New Menu']
      }
      setAssets(prev => [mockAsset, ...prev])
    } finally {
      setUploading(false)
    }
  }

  // --- Create Instagram Post from Asset ---
  const convertAssetToPost = async (asset: MediaAsset) => {
    if (!activeBrand) return
    showToast('Creating Instagram post from asset...', 'info')
    
    try {
      const res = await fetch(`/api/brands/${activeBrand.id}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption: `Indulge in our finest ${asset.aiCategory || 'delicacy'}! Made fresh daily just for you.`,
          mediaUrls: [asset.url],
          platform: 'instagram'
        })
      })

      if (res.ok) {
        const newDraft = await res.ok ? await res.json() : null
        if (newDraft) {
          setDrafts(prev => [newDraft, ...prev])
        }
        showToast('Created successfully! Review it in Calendar.')
        setActiveSubPage('calendar')
      } else {
        throw new Error('API creation failed')
      }
    } catch (err) {
      // Local mockup fallback
      const mockDraft: ContentDraft = {
        id: Math.random().toString(),
        caption: `Indulge in our finest ${asset.aiCategory || 'delicacy'}! Made fresh daily just for you.`,
        mediaUrls: [asset.url],
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        status: 'draft',
        platform: 'instagram'
      }
      setDrafts(prev => [mockDraft, ...prev])
      showToast('Created local draft mock.')
    }
  }

  // --- Update Add-ons & Subscription ---
  const handleToggleAddon = async (key: 'veo3' | 'dubco') => {
    if (!activeBrand) return
    const nextAddons = { ...addons, [key]: !addons[key] }
    setAddons(nextAddons)
    setUpdatingAddons(true)

    try {
      const res = await fetch(`/api/brands/${activeBrand.id}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAddons: nextAddons })
      })
      if (res.ok) {
        showToast(`${key === 'veo3' ? 'Veo3 Video API' : 'Dub.co Analytics'} subscription updated!`)
      }
    } catch (err) {
      console.error('Failed to sync subscription addon:', err)
      showToast('Toggle cached locally.')
    } finally {
      setUpdatingAddons(false)
    }
  }

  // --- Date helper for Weekly Planner ---
  const getWeekDates = () => {
    const dates = []
    const startOfWeek = new Date()
    // Go back to the nearest Friday (mockup specifies Fri 15 to Wed 20)
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(startOfWeek.getDate() + i)
      dates.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dateNum: d.getDate(),
        fullDate: d
      })
    }
    return dates
  }

  const weekDates = getWeekDates()

  // --- Floating alert interactive actions ---
  const handleMapsAlertClick = () => {
    setShowMapsAlert(false)
    setCompanionState('thinking')
    setMessages(prev => [
      ...prev,
      { sender: 'user', text: 'I saw the Google Maps low rating alert. What should we do?', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ])
    setTimeout(() => {
      setCompanionState('idle')
      setMessages(prev => [
        ...prev,
        { 
          sender: 'ai', 
          text: 'I detected a new 2-star review on Google Maps mentioning a 45-minute wait time. I suggest we draft a polite response and set up a "Quiet Hour Special" campaign this Tuesday to balance our dining room load. Would you like me to generate that post draft now?', 
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        }
      ])
    }, 1500)
  }

  const handleSuggestionClick = (text: string) => {
    setMessages(prev => [...prev, { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    setCompanionState('thinking')

    setTimeout(() => {
      setCompanionState('idle')
      let reply = `I've noted that! I will apply it to optimize our next campaigns for ${activeBrand?.name}.`
      if (text.toLowerCase().includes('review') || text.toLowerCase().includes('评价')) {
        reply = 'I have analyzed the recent feedback. Guests are raving about our Xiaolongbao, but there are a few requests for vegetarian dumpling options. I can draft a campaign highlighting our vegetarian menu if you like!'
      } else if (text.toLowerCase().includes('maps') || text.toLowerCase().includes('地图')) {
        reply = "I've drafted a Google Maps update post featuring our signature dishes and high-quality photography. Would you like me to schedule it?"
      } else if (text.toLowerCase().includes('meeting') || text.toLowerCase().includes('会议') || text.toLowerCase().includes('takeaway')) {
        reply = 'Here are the top 3 marketing takeaways for our next team meeting:\n1. Truffle Risotto campaign had a 24% conversion spike.\n2. Google Maps ratings need a minor push.\n3. Video content on Xiaohongshu is outperforming images by 2x.'
      }
      setMessages(prev => [...prev, { sender: 'ai', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    }, 1500)
  }

  return (
    <div className="min-h-screen text-slate-800 bg-[#f7f9fb] selection:bg-primary/10 overflow-hidden h-screen w-screen relative">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 border ${
              toast.type === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : toast.type === 'error' 
                ? 'bg-rose-50 border-rose-100 text-rose-800' 
                : 'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
            {toast.type === 'info' && <Sparkles className="w-4 h-4 text-indigo-600" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen WebGL Background */}
      {activeSubPage === null && (
        <div className="fixed inset-0 z-0">
          <canvas ref={canvasRef} className="w-full h-full block" />
          
          {/* Facial Expressions Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="flex flex-col items-center justify-center gap-6 w-32 h-32">
              {/* Eyes Row */}
              <div className="flex justify-between w-16 px-1">
                {/* Left Eye */}
                <motion.div 
                  animate={
                    companionState === 'listening' 
                      ? { scaleY: 1.2, scaleX: 1.1 } 
                      : companionState === 'thinking' 
                      ? { scaleY: 0.5, y: 1 } 
                      : { scaleY: [1, 1, 0.1, 1, 1] } /* Idle blinking */
                  }
                  transition={
                    companionState === 'idle'
                      ? { repeat: Infinity, duration: 4, times: [0, 0.9, 0.95, 1, 1] }
                      : { duration: 0.3 }
                  }
                  className="w-3.5 h-3.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                />
                {/* Right Eye */}
                <motion.div 
                  animate={
                    companionState === 'listening' 
                      ? { scaleY: 1.2, scaleX: 1.1 } 
                      : companionState === 'thinking' 
                      ? { scaleY: 0.5, y: 1 } 
                      : { scaleY: [1, 1, 0.1, 1, 1] } /* Idle blinking */
                  }
                  transition={
                    companionState === 'idle'
                      ? { repeat: Infinity, duration: 4, times: [0, 0.9, 0.95, 1, 1] }
                      : { duration: 0.3 }
                  }
                  className="w-3.5 h-3.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                />
              </div>

              {/* Mouth */}
              <div className="h-6 flex items-center justify-center">
                {companionState === 'idle' && (
                  /* Smiling gentle curve */
                  <svg width="24" height="8" viewBox="0 0 24 8" fill="none">
                    <path d="M2 2C6 6 18 6 22 2" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}

                {companionState === 'listening' && (
                  /* Wavy sound wave lines */
                  <div className="flex items-center gap-1">
                    <motion.div 
                      animate={{ height: [4, 16, 4] }}
                      transition={{ repeat: Infinity, duration: 0.5, ease: "easeInOut" }}
                      className="w-1 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                    />
                    <motion.div 
                      animate={{ height: [6, 22, 6] }}
                      transition={{ repeat: Infinity, duration: 0.4, ease: "easeInOut", delay: 0.1 }}
                      className="w-1 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                    />
                    <motion.div 
                      animate={{ height: [4, 16, 4] }}
                      transition={{ repeat: Infinity, duration: 0.5, ease: "easeInOut", delay: 0.2 }}
                      className="w-1 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                    />
                  </div>
                )}

                {companionState === 'thinking' && (
                  /* Thinking breathing dot / load bar */
                  <motion.div 
                    animate={{ scaleX: [1, 2.5, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                    className="w-4 h-1.5 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.6)]"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top App Bar */}
      <header className="fixed top-0 w-full z-40 bg-white/40 backdrop-blur-md h-16 flex items-center justify-between px-4 border-b border-slate-200/20">
        <div className="relative">
          <button 
            onClick={() => setBrandDropdownOpen(prev => !prev)}
            className="flex items-center gap-2 text-left group active:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[18px]">restaurant</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-0.5">
                <span className="font-semibold text-sm text-slate-800 max-w-[150px] truncate">
                  {activeBrand ? activeBrand.name : 'Loading Brand...'}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${brandDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                  AI Pilot: {activeBrand?.autoPilot ? 'Active' : 'Approval Mode'}
                </span>
              </div>
            </div>
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {brandDropdownOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50"
              >
                <div className="p-3 border-b border-slate-50">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Switch Brand</p>
                </div>
                {brands.map(b => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setActiveBrand(b)
                      setBrandDropdownOpen(false)
                    }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors ${
                      activeBrand?.id === b.id ? 'bg-indigo-50/50 text-primary font-bold' : 'text-slate-600'
                    }`}
                  >
                    <span>{b.name}</span>
                    {activeBrand?.id === b.id && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button 
          onClick={() => setSideMenuOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined text-slate-700 text-[28px]">menu</span>
        </button>
      </header>

      {/* Collapsible Notification Center */}
      {activeSubPage === null && (showMapsAlert || showScheduleAlert) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-40 px-4 pointer-events-none flex flex-col items-center">
          
          {/* Consolidated Pill Trigger */}
          {!notificationsExpanded && (
            <motion.button
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onClick={() => setNotificationsExpanded(true)}
              className="pointer-events-auto flex items-center justify-between gap-3 px-5 py-3 rounded-full bg-white/85 backdrop-blur-md border border-white/60 shadow-lg cursor-pointer hover:bg-white active:scale-95 transition-all text-xs font-bold text-slate-700"
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span className="material-symbols-outlined text-[16px] text-slate-500">notifications</span>
                <span>{(showMapsAlert ? 1 : 0) + (showScheduleAlert ? 1 : 0)} updates require attention</span>
              </div>
              <span className="material-symbols-outlined text-[16px] text-slate-400">expand_more</span>
            </motion.button>
          )}

          {/* Expanded Accordion list */}
          <AnimatePresence>
            {notificationsExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ type: 'spring', damping: 22, stiffness: 180 }}
                className="pointer-events-auto w-full bg-white/90 backdrop-blur-lg border border-slate-200/50 rounded-2xl p-4 shadow-xl space-y-3 overflow-hidden"
              >
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Updates & Notifications</span>
                  <button 
                    onClick={() => setNotificationsExpanded(false)}
                    className="text-[10px] font-bold text-primary flex items-center gap-0.5 hover:underline cursor-pointer"
                  >
                    <span>Collapse</span>
                    <span className="material-symbols-outlined text-[12px]">expand_less</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {showMapsAlert && (
                    <div 
                      className="flex items-start justify-between p-3 rounded-xl border border-rose-100 bg-rose-50/20 hover:bg-rose-50/40 transition-colors"
                    >
                      <div 
                        onClick={handleMapsAlertClick}
                        className="flex items-start gap-3 cursor-pointer flex-1"
                      >
                        <div className="bg-rose-50 p-2 rounded-lg text-rose-500 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-lg">location_on</span>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-0.5">Alert</h4>
                          <p className="text-[12px] leading-snug text-slate-800 font-bold">Low rating alert on Google Maps</p>
                          <p className="text-[10px] text-slate-400 font-medium">Click to generate AI response</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setShowMapsAlert(false)
                          if (!showScheduleAlert) setNotificationsExpanded(false)
                        }}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  )}

                  {showScheduleAlert && (
                    <div 
                      className="flex items-start justify-between p-3 rounded-xl border border-indigo-100 bg-indigo-50/20 hover:bg-indigo-50/40 transition-colors"
                    >
                      <div 
                        onClick={() => {
                          setActiveSubPage('calendar')
                          setShowScheduleAlert(false)
                          setNotificationsExpanded(false)
                        }}
                        className="flex items-start gap-3 cursor-pointer flex-1"
                      >
                        <div className="bg-indigo-50 p-2 rounded-lg text-primary flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-lg">calendar_today</span>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Schedule</h4>
                          <p className="text-[12px] leading-snug text-slate-800 font-bold">Upcoming schedule draft needs review</p>
                          <p className="text-[10px] text-slate-400 font-medium">Click to review drafts calendar</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setShowScheduleAlert(false)
                          if (!showMapsAlert) setNotificationsExpanded(false)
                        }}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Main Content Area - Companion Chat interface */}
      {activeSubPage === null && (
        <main className="relative z-10 h-full flex flex-col pt-16 pb-safe">
          {/* Conversation Feed */}
          <div className="flex-1 overflow-y-auto px-4 py-8 space-y-6 no-scrollbar">
            {messages.map((m, idx) => (
              <div 
                key={idx} 
                className={`flex flex-col gap-1.5 max-w-[85%] ${
                  m.sender === 'user' ? 'self-end ml-auto items-end' : 'self-start mr-auto items-start'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  {m.sender === 'ai' ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-indigo-tint flex items-center justify-center">
                        <span className="material-symbols-outlined text-[12px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">AI Marketing Crew</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest text-right">Brand Owner</span>
                      <div className="w-5 h-5 rounded-full bg-slate-200 overflow-hidden">
                        <img 
                          className="w-full h-full object-cover" 
                          alt="Brand Owner avatar" 
                          src="https://lh3.googleusercontent.com/aida-public/AB6AXuB3UEaCm3FZ3UFXcu5DZu89flKJ3W4pQYYdWEsCKdfzsX0Qr1JLXL5s6rozn75dBXVZWBtUB0VH7RctN_ZMLNMsA4ncwe3Rderxv-W0iVv7IKkleVAfGz_pMOlx_p0ghGbRWUqNeadQoQ_aw3L7BUV7qStdrTpM6l45M4osPzjOUItkYIvOQxV7vMlXE8msjDJ6iG_HPn1VpW10LIWn7I59yS9ULH4_cxvNjJiGAVX0MRbL9hAFiJG4tdJ0YajtpPhzstY5ZHc_0Hg"
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className={`p-4 rounded-2xl shadow-sm ${
                  m.sender === 'user' 
                    ? 'bg-primary text-white rounded-tr-none' 
                    : 'bg-white/80 backdrop-blur-md text-slate-700 rounded-tl-none border border-white/60'
                }`}>
                  <p className="text-xs leading-relaxed whitespace-pre-line">{m.text}</p>
                  <span className={`block text-[9px] mt-1 text-right ${m.sender === 'user' ? 'text-white/60' : 'text-slate-400'}`}>
                    {m.time}
                  </span>
                </div>
              </div>
            ))}
            {companionState === 'thinking' && (
              <div className="flex items-center gap-2 text-xs text-slate-400 italic bg-white/60 backdrop-blur-sm p-3 rounded-xl border border-white/40 w-fit">
                <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
                <span>AI companion is thinking...</span>
              </div>
            )}
          </div>

          {/* Chat Input Console */}
          <div className="px-4 pb-8 pt-4 bg-gradient-to-t from-[#f7f9fb] via-[#f7f9fb]/90 to-transparent">
            {/* Context suggestions */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
              {[
                { label: 'Analyze Review', text: 'Analyze our latest store reviews' },
                { label: 'Post on Maps', text: 'Post a new update on Google Maps' },
                { label: 'Next Staff Meeting', text: 'Generate takeaways for next staff meeting' }
              ].map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(pill.text)}
                  className="whitespace-nowrap px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-slate-200/80 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="bg-white/80 backdrop-blur-md p-2 pr-2 pl-4 rounded-full flex items-center gap-3 border border-white/50 shadow-xl focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask your AI Marketing Crew..." 
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-700 placeholder-slate-400/80 py-2.5"
              />
              <button 
                onClick={startVoiceAssist}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-all ${
                  companionState === 'listening'
                    ? 'bg-emerald-600 shadow-emerald-600/20 animate-pulse'
                    : 'bg-primary hover:bg-indigo-tint shadow-primary/20'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
              {chatInput.trim() && (
                <button 
                  onClick={handleSendMessage}
                  className="w-10 h-10 rounded-full bg-primary hover:bg-indigo-tint text-white flex items-center justify-center transition-colors active:scale-95 shadow-md shadow-primary/10"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* Sub-page overlay views */}
      {activeSubPage !== null && (
        <div className="fixed inset-0 z-50 bg-[#f7f9fb] overflow-y-auto pb-10 flex flex-col">
          {/* Subpage Header */}
          <header className="sticky top-0 w-full z-40 bg-[#f7f9fb]/90 backdrop-blur-md shadow-sm h-16 flex items-center justify-between px-4 border-b border-slate-200/50">
            <button 
              onClick={() => setActiveSubPage(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/50 active:scale-95 transition-all"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              <span>Back to Chat</span>
            </button>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              {activeSubPage === 'calendar' && 'Campaign Calendar'}
              {activeSubPage === 'assets' && 'Media Library'}
              {activeSubPage === 'market' && 'Add-on Marketplace'}
              {activeSubPage === 'settings' && 'AI Character Settings'}
            </h2>
            <div className="w-20" /> {/* Spacer */}
          </header>

          <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-6">
            {activeSubPage === 'calendar' && (
              <>
                {/* Campaign Calendar */}
                <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Monthly Calendar</h3>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-2">
                    <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`h-11 rounded-lg flex flex-col items-center justify-between p-1 text-[11px] ${
                          i + 1 === new Date().getDate() 
                            ? 'bg-primary text-white font-bold' 
                            : 'bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>{i + 1}</span>
                        {i % 4 === 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-bold text-slate-400">Scheduled Posts This Month</p>
                    <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between text-xs">
                      <span>Xiaohongshu Weekend Feast</span>
                      <span className="text-[10px] text-slate-400">June 26</span>
                    </div>
                  </div>
                </section>

                {/* Weekly Planner Feed */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Weekly Planner</h3>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(Date.now() + 6*24*60*60*1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
                    {/* Horizontal days slider */}
                    <div className="flex justify-between overflow-x-auto gap-2 no-scrollbar">
                      {weekDates.map(day => (
                        <button
                          key={day.dateNum}
                          onClick={() => setSelectedDay(day.dateNum)}
                          className={`flex flex-col items-center gap-1.5 px-3.5 py-2.5 rounded-xl transition-all ${
                            selectedDay === day.dateNum
                              ? 'bg-primary text-white shadow-md shadow-primary/20 scale-105'
                              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-[9px] font-extrabold uppercase opacity-80">{day.dayName}</span>
                          <span className="text-sm font-black">{day.dateNum}</span>
                        </button>
                      ))}
                    </div>

                    {/* Action Items List */}
                    <div className="space-y-2">
                      {drafts.length === 0 ? (
                        <div className="text-center py-6 text-xs text-slate-400 italic">
                          No campaign posts scheduled for today.
                        </div>
                      ) : (
                        drafts.map(draft => (
                          <div 
                            key={draft.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-primary">
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{draft.caption || 'Weekly Feast Special'}</h4>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase">{draft.platform} • Scheduled</p>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tight ${
                              draft.status === 'published' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {draft.status === 'published' ? 'Published' : 'Pending Review'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}

            {activeSubPage === 'assets' && (
              <>
                {/* Quick Assets */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Quick Upload</h3>
                  </div>

                  {/* Upload Pill */}
                  <button 
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="w-full bg-white border-dashed border-2 border-primary/20 hover:border-primary/40 p-4 rounded-2xl flex items-center justify-center gap-3 transition-colors active:bg-slate-50/60 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Plus className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">
                      {uploading ? 'Processing File...' : 'Upload Fresh Dish Photos'}
                    </span>
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                  />

                  {/* Horizontally scrolling uploaded assets */}
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {assets.length === 0 ? (
                      <div className="w-full text-center py-6 text-xs text-slate-400 italic">
                        No recent photo assets. Upload some above!
                      </div>
                    ) : (
                      assets.map(asset => (
                        <div key={asset.id} className="flex-shrink-0 w-44 bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm flex flex-col justify-between">
                          <div className="relative h-40 w-full bg-slate-50">
                            <img 
                              src={asset.url} 
                              alt={asset.filename || 'Uploaded asset'} 
                              className="w-full h-full object-cover"
                            />
                            {asset.aiCategory && (
                              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] bg-slate-900/70 text-white font-semibold backdrop-blur-sm">
                                {asset.aiCategory}
                              </span>
                            )}
                          </div>
                          <div className="p-2 border-t border-slate-50">
                            <button 
                              onClick={() => convertAssetToPost(asset)}
                              className="w-full bg-primary text-white py-1.5 rounded-xl text-[10px] font-bold active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3 text-amber-300" />
                              To Instagram Post
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Media Library */}
                <section className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Media Library Grid</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {assets.length === 0 ? (
                      <div className="col-span-2 text-center py-10 text-xs text-slate-400 italic">
                        No assets in library. Upload files.
                      </div>
                    ) : (
                      assets.map(asset => (
                        <div key={asset.id} className="border border-slate-100 rounded-xl overflow-hidden shadow-sm flex flex-col bg-slate-50 group relative">
                          <div className="h-32 w-full bg-slate-100">
                            <img 
                              src={asset.url} 
                              alt={asset.filename || 'Media Library asset'} 
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-2 bg-white flex flex-col justify-between flex-1">
                            <p className="text-[10px] text-slate-500 truncate mb-2">{asset.filename || 'Untitled Asset'}</p>
                            <button 
                              onClick={() => convertAssetToPost(asset)}
                              className="w-full bg-primary/10 hover:bg-primary/20 text-primary py-1.5 rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3" /> Create Post
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )}

            {activeSubPage === 'market' && (
              <>
                {/* Standard Package Card */}
                <div className="bg-primary p-6 rounded-2xl text-white relative overflow-hidden shadow-lg shadow-primary/20">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[9px] bg-white/20 px-2 py-0.5 rounded-full text-white uppercase tracking-wider mb-1.5 inline-block font-bold">Current Plan</span>
                        <h2 className="text-xl font-bold">Standard Package</h2>
                      </div>
                      <ShieldCheck className="w-8 h-8 opacity-75" />
                    </div>
                    
                    <div className="space-y-3 mt-6">
                      {/* Veo3 Toggle */}
                      <div className="flex items-center justify-between bg-white/10 p-3 rounded-xl backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <Video className="w-5 h-5" />
                          <div>
                            <span className="text-xs font-semibold block">Veo3 Image-to-Video</span>
                            <span className="text-[9px] text-white/60">Generate high quality marketing reels</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={addons.veo3} 
                            onChange={() => handleToggleAddon('veo3')}
                            className="sr-only peer" 
                            disabled={updatingAddons}
                          />
                          <div className="w-9 h-5 bg-white/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {/* Dub.co Toggle */}
                      <div className="flex items-center justify-between bg-white/10 p-3 rounded-xl backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <Link className="w-5 h-5" />
                          <div>
                            <span className="text-xs font-semibold block">Dub.co ROI tracking</span>
                            <span className="text-[9px] text-white/60">Short-link analytics for conversions</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={addons.dubco} 
                            onChange={() => handleToggleAddon('dubco')}
                            className="sr-only peer" 
                            disabled={updatingAddons}
                          />
                          <div className="w-9 h-5 bg-white/30 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
                </div>

                {/* Marketplace Add-ons */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Add-on Services Marketplace</h3>
                  
                  <div className="divide-y divide-slate-100">
                    <div className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-700">Custom Domain Mapping</p>
                        <p className="text-[10px] text-slate-400">Map your own custom short domains</p>
                      </div>
                      <button className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg font-bold cursor-pointer">
                        $9/mo
                      </button>
                    </div>
                    <div className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-700">Xiaohongshu Publisher API</p>
                        <p className="text-[10px] text-slate-400">Direct automated push publishing</p>
                      </div>
                      <button className="bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg font-bold cursor-pointer">
                        $19/mo
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeSubPage === 'settings' && (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-800">Brand Character Settings</h3>
                <p className="text-xs text-slate-400">
                  Teach the AI companion about your store tone, menu items, and target slang dictionary.
                </p>
                
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Brand Voice Style</label>
                    <textarea 
                      defaultValue={activeBrand?.description || 'A casual, engaging restaurant tone using local Singlish slang.'}
                      rows={3}
                      className="w-full text-xs p-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Local Slang Dictionary</label>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="font-semibold">"Chope"</span>
                        <span className="text-slate-400">Reserve a seat</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="font-semibold">"Bojio"</span>
                        <span className="text-slate-400">Inviting someone</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    showToast('Brand voice parameters saved!')
                    setActiveSubPage(null)
                  }}
                  className="w-full bg-primary text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-primary/20 active:scale-95 transition-all mt-4 cursor-pointer"
                >
                  Save AI Instructions
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Side Menu Drawer */}
      <AnimatePresence>
        {sideMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSideMenuOpen(false)}
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            />
            {/* Drawer */}
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-[280px] bg-[#f7f9fb] shadow-2xl z-50 flex flex-col p-8 border-l border-slate-200/50"
            >
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-base font-bold text-slate-800">Menu</h3>
                <button 
                  onClick={() => setSideMenuOpen(false)}
                  className="material-symbols-outlined text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  close
                </button>
              </div>
              <nav className="space-y-6">
                <button 
                  onClick={() => {
                    setActiveSubPage('calendar')
                    setSideMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-4 text-slate-600 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                >
                  <span className="material-symbols-outlined text-2xl text-slate-500">calendar_month</span>
                  <span className="font-semibold text-sm">Calendar</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveSubPage('market')
                    setSideMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-4 text-slate-600 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                >
                  <span className="material-symbols-outlined text-2xl text-slate-500">shopping_bag</span>
                  <span className="font-semibold text-sm">Market</span>
                </button>
                <button 
                  onClick={() => {
                    setActiveSubPage('assets')
                    setSideMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-4 text-slate-600 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                >
                  <span className="material-symbols-outlined text-2xl text-slate-500">image</span>
                  <span className="font-semibold text-sm">Assets</span>
                </button>
                <div className="pt-6 mt-6 border-t border-slate-200/50">
                  <button 
                    onClick={() => {
                      setActiveSubPage('settings')
                      setSideMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-4 text-slate-600 hover:text-primary transition-colors py-2 text-left cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-2xl text-slate-500">settings</span>
                    <span className="font-semibold text-sm">Settings</span>
                  </button>
                </div>
              </nav>
              <div className="mt-auto p-4 rounded-2xl bg-indigo-50 border border-indigo-100/50">
                <p className="text-[10px] font-bold text-primary uppercase mb-2">Digital Assistant Status</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs text-slate-700 font-medium">Marketing Engine Active</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  )
}
