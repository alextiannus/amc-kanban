import { redirect } from 'next/navigation'

export default function BrandOwnerRootPage() {
  // Redirect root to dashboard; dashboard will handle auth check and redirect to /login if needed
  redirect('/dashboard')
}
