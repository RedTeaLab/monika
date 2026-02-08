import { useState, useEffect } from 'react'

export interface BreakpointResult {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const BREAKPOINTS = {
  mobile: 768,
  desktop: 1024
}

export function useBreakpoint(): BreakpointResult {
  const [breakpoint, setBreakpoint] = useState<BreakpointResult>(() => {
    const width = window.innerWidth
    return {
      isMobile: width < BREAKPOINTS.mobile,
      isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.desktop,
      isDesktop: width >= BREAKPOINTS.desktop
    }
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      setBreakpoint({
        isMobile: width < BREAKPOINTS.mobile,
        isTablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.desktop,
        isDesktop: width >= BREAKPOINTS.desktop
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return breakpoint
}
