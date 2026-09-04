import { useEffect, useState } from 'react'

/**
 * Honors the user's OS-level reduced-motion preference AND exposes it to the
 * rest of the app via `body[data-reduced-motion]`, so CSS can downgrade all
 * animation/transition durations in one place (tokens.css).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.dataset.reducedMotion = reduced ? 'reduce' : 'normal'
  }, [reduced])

  return reduced
}

/** Best-effort low-power detection (data-dpr + navigator.deviceMemory). */
export function useMotionLevel(): 'normal' | 'low' {
  const [level, setLevel] = useState<'normal' | 'low'>('normal')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const dpr = window.devicePixelRatio || 1
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
    const cores = navigator.hardwareConcurrency ?? 4
    if (dpr <= 1 && (mem <= 2 || cores <= 2)) setLevel('low')
  }, [])
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.dataset.motionLevel = level
  }, [level])
  return level
}