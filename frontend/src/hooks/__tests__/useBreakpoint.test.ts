import { renderHook, act } from '@testing-library/react'
import { useBreakpoint } from '../useBreakpoint'

describe('useBreakpoint', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns correct breakpoint for desktop', () => {
    vi.stubGlobal('innerWidth', 1200)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      isMobile: false,
      isTablet: false,
      isDesktop: true
    })
  })

  it('returns correct breakpoint for tablet', () => {
    vi.stubGlobal('innerWidth', 900)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      isMobile: false,
      isTablet: true,
      isDesktop: false
    })
  })

  it('returns correct breakpoint for mobile', () => {
    vi.stubGlobal('innerWidth', 600)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toEqual({
      isMobile: true,
      isTablet: false,
      isDesktop: false
    })
  })

  it('updates on window resize', () => {
    const { result } = renderHook(() => useBreakpoint())

    act(() => {
      vi.stubGlobal('innerWidth', 800)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.isTablet).toBe(true)
  })
})
