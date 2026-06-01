import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import SubscriptionClient from './SubscriptionClient'

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      }
    >
      <SubscriptionClient />
    </Suspense>
  )
}
