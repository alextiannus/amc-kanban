import { useEffect, useState } from 'react'

interface AvatarImageProps {
  src?: string | null
  alt?: string
  className?: string
  fallbackClassName?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function AvatarImage({ 
  src, 
  alt = 'Avatar', 
  className = 'w-full h-full object-cover',
  fallbackClassName = '',
  size = 'md'
}: AvatarImageProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(!!src)

  useEffect(() => {
    // Reset image state whenever src changes so successful new uploads can render.
    setHasError(false)
    setIsLoading(!!src)
  }, [src])

  const handleError = () => {
    setHasError(true)
    setIsLoading(false)
  }

  const handleLoad = () => {
    setIsLoading(false)
  }

  if (!src || hasError) {
    // Show default lobster avatar
    return (
      <img 
        src="/default-lobster-avatar.svg" 
        alt={alt}
        className={className}
        onError={() => {
          // Fallback if SVG also fails
          setHasError(true)
        }}
      />
    )
  }

  return (
    <img 
      src={src} 
      alt={alt}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
    />
  )
}
