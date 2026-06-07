import { useEffect, useState } from 'react'
/* eslint-disable @next/next/no-img-element */

interface AvatarImageProps {
  src?: string | null
  alt?: string
  className?: string
}

export default function AvatarImage({ 
  src, 
  alt = 'Avatar', 
  className = 'w-full h-full object-cover'
}: AvatarImageProps) {
  const [hasError, setHasError] = useState(false)
  const [cacheBuster, setCacheBuster] = useState(0)

  useEffect(() => {
    // Reset image state whenever src changes, and add cache buster
    queueMicrotask(() => {
      setHasError(false)
      // Add timestamp to URL to bust browser cache on new uploads
      setCacheBuster(new Date().getTime())
    })
  }, [src])

  const handleError = () => {
    setHasError(true)
  }

  if (!src) {
    // No source provided - show placeholder
    return (
      <div 
        className={`${className} bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center`}
      >
        <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold">无头像</span>
      </div>
    )
  }

  if (hasError) {
    // Image failed to load - show error state
    return (
      <div 
        className={`${className} bg-red-100 dark:bg-red-900/20 flex items-center justify-center border-2 border-dashed border-red-300 dark:border-red-700`}
      >
        <span className="text-red-600 dark:text-red-400 text-xs font-semibold text-center px-2">加载失败</span>
      </div>
    )
  }

  // For data URIs, don't add cache buster (it would break the URL)
  const imgSrc = src.startsWith('data:') ? src : `${src}?cb=${cacheBuster}`

  return (
    <img 
      src={imgSrc} 
      alt={alt}
      className={className}
      onError={handleError}
    />
  )
}
