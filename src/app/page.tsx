'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn, UserPlus } from 'lucide-react'

const INPUT_CLASS =
  'appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [country, setCountry] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
    setNickname('')
    setCountry('')
    setPhone('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname, country, phone }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/board')
        router.refresh()
      } else {
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/board/subscription')
        router.refresh()
      } else {
        setError(data.error || 'Registration failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const isRegister = mode === 'register'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full p-8 space-y-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AI Marketing Crew</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {isRegister ? 'Create your account to get started' : 'Sign in to access the collaboration board'}
          </p>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              !isRegister
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              isRegister
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Create account
          </button>
        </div>

        <form className="mt-2 space-y-4" onSubmit={isRegister ? handleRegister : handleLogin}>
          <div>
            <label className="sr-only" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className={INPUT_CLASS}
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="sr-only" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className={INPUT_CLASS}
              placeholder={isRegister ? 'Password (min 8 characters)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {isRegister && (
            <>
              <div>
                <label className="sr-only" htmlFor="nickname">Nickname</label>
                <input
                  id="nickname"
                  type="text"
                  required
                  className={INPUT_CLASS}
                  placeholder="Nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor="country">Country</label>
                <input
                  id="country"
                  type="text"
                  required
                  className={INPUT_CLASS}
                  placeholder="Country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor="phone">Contact phone</label>
                <input
                  id="phone"
                  type="tel"
                  required
                  className={INPUT_CLASS}
                  placeholder="Contact phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className={INPUT_CLASS}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <div className="text-red-500 text-sm text-center font-medium">{error}</div>}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                {isRegister
                  ? <UserPlus className="h-5 w-5 text-blue-400 group-hover:text-blue-300" aria-hidden="true" />
                  : <LogIn className="h-5 w-5 text-blue-400 group-hover:text-blue-300" aria-hidden="true" />}
              </span>
              {loading
                ? (isRegister ? 'Creating account...' : 'Signing in...')
                : (isRegister ? 'Create account' : 'Sign in')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
