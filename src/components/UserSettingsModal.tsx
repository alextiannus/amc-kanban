import { useState } from 'react'
import { X, Check } from 'lucide-react'

export default function UserSettingsModal({ user, onClose }: { user: any, onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (password.length < 4) {
      setError('密码至少需要4个字符')
      return
    }
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (res.ok) {
        setSuccess(true)
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to update password')
      }
    } catch (e) {
      setError('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/20 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">⚙️ 个人设置</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">账号邮箱</label>
            <input type="text" disabled value={user.email} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">修改密码</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="输入新密码..." 
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
        </div>

        <button 
          onClick={handleSave} 
          disabled={saving || success}
          className="w-full mt-8 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
        >
          {success ? <><Check size={18} /> 保存成功</> : saving ? '保存中...' : '确认修改'}
        </button>
      </div>
    </div>
  )
}
