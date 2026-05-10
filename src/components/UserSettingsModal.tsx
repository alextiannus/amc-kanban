import { useState, type ChangeEvent } from 'react'
import { X, Check } from 'lucide-react'

export default function UserSettingsModal({ user, onClose, onUpdated }: { user: any, onClose: () => void, onUpdated?: () => void }) {
  const [nickname, setNickname] = useState(user.nickname || '')
  const [introduction, setIntroduction] = useState(user.introduction || '')
  const [password, setPassword] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar || null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('头像文件必须是图片格式')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('头像文件不能超过 5MB')
      return
    }

    setError('')
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (password && password.length < 4) {
      setError('密码至少需要4个字符')
      return
    }

    const nicknameChanged = (nickname || '').trim() !== (user.nickname || '')
    const introductionChanged = (introduction || '').trim() !== (user.introduction || '')
    const passwordChanged = password.length > 0
    const avatarChanged = !!avatarFile

    if (!nicknameChanged && !introductionChanged && !passwordChanged && !avatarChanged) {
      onClose()
      return
    }

    setError('')
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('nickname', (nickname || '').trim())
      formData.append('introduction', (introduction || '').trim())
      if (passwordChanged) {
        formData.append('password', password)
      }
      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        body: formData
      })
      if (res.ok) {
        setSuccess(true)
        onUpdated?.()
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
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">⚙️ 个人设置</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="输入昵称..."
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">账号邮箱</label>
            <input type="text" disabled value={user.email} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">身份简介</label>
            <textarea
              value={introduction}
              onChange={e => setIntroduction(e.target.value)}
              placeholder="请在此描述：品牌名、运营平台、运营理念..."
              className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
              rows={3}
            />
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
              <p className="font-semibold">💡 建议包含：</p>
              <ul className="mt-1 ml-3 space-y-0.5 list-disc text-xs">
                <li>品牌名</li>
                <li>运营平台</li>
                <li>运营理念</li>
              </ul>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">头像</label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 text-sm font-bold">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  (nickname || user.email).charAt(0).toUpperCase()
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 file:font-semibold hover:file:bg-slate-200 dark:hover:file:bg-slate-700"
              />
            </div>
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
