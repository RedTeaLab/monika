import { useEffect, useRef, useCallback } from 'react'

interface PerformanceMetrics {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
}

interface PerformanceEntry {
  name: string
  startTime: number
  duration: number
}

const PERFORMANCE_THRESHOLDS = {
  fcp: { good: 1800, needsImprovement: 3000 },
  lcp: { good: 2500, needsImprovement: 4000 },
  fid: { good: 100, needsImprovement: 300 },
  cls: { good: 0.1, needsImprovement: 0.25 },
  ttfb: { good: 800, needsImprovement: 1800 },
}

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = PERFORMANCE_THRESHOLDS[name as keyof typeof PERFORMANCE_THRESHOLDS]
  if (!threshold) return 'good'
  if (value <= threshold.good) return 'good'
  if (value <= threshold.needsImprovement) return 'needs-improvement'
  return 'poor'
}

export function usePerformanceMonitor() {
  const entriesRef = useRef<PerformanceEntry[]>([])
  const marksRef = useRef<Map<string, number>>(new Map())

  const mark = useCallback((name: string) => {
    marksRef.current.set(name, performance.now())
  }, [])

  const measure = useCallback((name: string, startMark: string, endMark?: string) => {
    const startTime = marksRef.current.get(startMark)
    const endTime = endMark ? marksRef.current.get(endMark) : performance.now()
    
    if (startTime === undefined) {
      console.warn(`Performance mark "${startMark}" not found`)
      return null
    }

    const duration = (endTime ?? performance.now()) - startTime
    entriesRef.current.push({ name, startTime, duration })
    
    return {
      name,
      value: duration,
      rating: getRating(name, duration),
    }
  }, [])

  const log = useCallback(() => {
    if (typeof window === 'undefined' || !window.performance) return

    const paintEntries = performance.getEntriesByType('paint') as PerformancePaintTiming[]
    const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]

    console.group('[Performance Monitor]')
    
    paintEntries.forEach(entry => {
      console.log(`Paint: ${entry.name}`, `${entry.startTime.toFixed(2)}ms`)
    })

    if (navigationEntries[0]) {
      const nav = navigationEntries[0]
      console.log(`TTFB: ${(nav.responseStart - nav.requestStart).toFixed(2)}ms`)
      console.log(`DOM Content Loaded: ${(nav.domContentLoadedEventEnd - nav.requestStart).toFixed(2)}ms`)
      console.log(`Load Complete: ${(nav.loadEventEnd - nav.requestStart).toFixed(2)}ms`)
    }

    const largestContentfulPaint = performance.getEntriesByType('largest-contentful-paint')[0] as PerformanceEntry
    if (largestContentfulPaint) {
      console.log(`LCP: ${largestContentfulPaint.startTime.toFixed(2)}ms`)
    }

    const firstInput = performance.getEntriesByType('first-input')[0] as PerformanceEventTiming
    if (firstInput) {
      const fid = firstInput.processingStart - firstInput.startTime
      console.log(`FID: ${fid.toFixed(2)}ms`)
    }

    const slowResources = resourceEntries.filter(r => r.duration > 1000)
    if (slowResources.length > 0) {
      console.warn('Slow resources:', slowResources.map(r => ({ name: r.name, duration: r.duration.toFixed(2) })))
    }

    console.groupEnd()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          console.log(`[LCP] ${entry.startTime.toFixed(2)}ms`)
        }
        if (entry.entryType === 'first-input') {
          console.log(`[FID] ${(entry as PerformanceEventTiming).processingStart - entry.startTime}ms`)
        }
        if (entry.entryType === 'layout-shift') {
          const score = (entry as any).value
          if (score > 0.1) {
            console.warn(`[CLS] ${score.toFixed(4)} at ${entry.startTime}ms`)
          }
        }
      }
    })

    try {
      observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] })
    } catch (e) {
      console.warn('Performance observer not supported')
    }

    window.addEventListener('load', () => {
      setTimeout(log, 2000)
    })

    return () => observer.disconnect()
  }, [log])

  return { mark, measure, log, entries: entriesRef.current }
}

export function useWebVitals() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const reportWebVitals = ({ name, value, rating }: PerformanceMetrics) => {
      if (import.meta.env.DEV) {
        console.log(`[Web Vitals] ${name}: ${value.toFixed(2)}ms (${rating})`)
      }
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          reportWebVitals({
            name: 'LCP',
            value: entry.startTime,
            rating: getRating('lcp', entry.startTime),
          })
        }
        if (entry.entryType === 'first-input') {
          const fid = (entry as PerformanceEventTiming).processingStart - entry.startTime
          reportWebVitals({
            name: 'FID',
            value: fid,
            rating: getRating('fid', fid),
          })
        }
        if (entry.entryType === 'layout-shift') {
          const cls = (entry as any).value
          if (typeof cls === 'number') {
            reportWebVitals({
              name: 'CLS',
              value: cls,
              rating: getRating('cls', cls),
            })
          }
        }
      }
    })

    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] })

    return () => observer.disconnect()
  }, [])
}
