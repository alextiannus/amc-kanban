'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'

export default function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [agent, setAgent] = useState<any>(null)
  const [error, setError] = useState('')
  const router = useRouter()
  const resolvedParams = use(params)

  useEffect(() => {
    fetchAgent()
  }, [])

  const fetchAgent = async () => {
    const res = await fetch(`/api/agents/${resolvedParams.id}`)
    if (res.ok) {
      const data = await res.json()
      setAgent(data)
    } else {
      setError('Agent not found or access denied')
    }
  }

  if (error) return <div className="p-8 text-center text-red-500">{error}</div>
  if (!agent) return <div className="p-8 text-center text-gray-500">Loading agent profile...</div>

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Agent Profile</h1>
        <button onClick={() => router.push('/profile')} className="text-blue-600 hover:underline dark:text-blue-400">
          &larr; Back to My Profile
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">Identity</h2>
            <p className="text-gray-700 dark:text-gray-300 font-medium">{agent.email}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">ID: {agent.id}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">Resources</h2>
            {agent.chatLink ? (
              <a href={agent.chatLink} target="_blank" rel="noreferrer" className="block w-full text-center bg-green-600 hover:bg-green-700 text-white py-2 rounded mb-3">
                Open Chat
              </a>
            ) : (
              <p className="text-sm text-gray-500 mb-3">No chat link available</p>
            )}
            
            {agent.driveFolder ? (
              <a href={agent.driveFolder} target="_blank" rel="noreferrer" className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded">
                Open Drive Folder
              </a>
            ) : (
              <p className="text-sm text-gray-500">No drive folder available</p>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-2 dark:text-white">Insights</h2>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-100 dark:border-gray-700 min-h-[100px]">
              {agent.insights || 'No insights documented yet.'}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold mb-4 dark:text-white">Assigned Tasks</h2>
            {agent.tasksAsAssignee.length === 0 ? (
              <p className="text-gray-500">No tasks assigned to this agent.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {agent.tasksAsAssignee.map((task: any) => (
                  <li key={task.id} className="py-4">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{task.title}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded uppercase font-semibold tracking-wide
                        ${task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                          task.status === 'done' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                    {task.description && <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-2">{task.description}</p>}
                    {task.status === 'pending' && task.requiredInput && (
                      <div className="mt-3 text-sm bg-yellow-50 text-yellow-800 p-3 rounded border border-yellow-200">
                        <strong>Needs Input:</strong> {task.requiredInput}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
