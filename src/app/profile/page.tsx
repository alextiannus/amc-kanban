'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    const res = await fetch('/api/profile')
    if (res.ok) {
      const data = await res.json()
      setProfile(data)
    } else {
      router.push('/')
    }
  }

  if (!profile) return <div className="p-8 text-center text-gray-500">Loading profile...</div>

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <button onClick={() => router.push('/board')} className="text-blue-600 hover:underline dark:text-blue-400">
          &larr; Back to Board
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
        <h2 className="text-xl font-semibold mb-2 dark:text-white">Basic Information</h2>
        <div className="space-y-2 text-gray-700 dark:text-gray-300">
          <p><span className="font-medium">Email:</span> {profile.email}</p>
          <p><span className="font-medium">Role:</span> {profile.role}</p>
          <p><span className="font-medium">Account Type:</span> {profile.type}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Assigned AI Agents</h2>
        {profile.permittedAgents.length === 0 ? (
          <p className="text-gray-500">No AI agents have been assigned to you by the administrator.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.permittedAgents.map((pa: any) => {
              const agent = pa.agent
              return (
                <Link key={agent.id} href={`/agents/${agent.id}`} className="block bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-colors">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">{agent.email}</h3>
                  <div className="flex gap-2 mt-3">
                    {agent.chatLink && (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 px-2 py-1 rounded">Has Chat</span>
                    )}
                    {agent.driveFolder && (
                      <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 rounded">Has Drive</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
