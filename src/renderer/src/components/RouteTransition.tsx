import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

interface RouteTransitionProps {
  route: string
  reducedMotion: boolean
}

/**
 * A quick physical handoff between workspaces. Navigation is never delayed:
 * the new page mounts immediately and this surface only reveals it in motion.
 */
export function RouteTransition({ route, reducedMotion }: RouteTransitionProps) {
  const root = useRef<HTMLDivElement>(null)
  const previousRoute = useRef(route)

  useGSAP(
    () => {
      if (previousRoute.current === route) return
      previousRoute.current = route
      const curtain = root.current
      if (!curtain || reducedMotion) return

      const timeline = gsap.timeline({ defaults: { overwrite: 'auto' } })
      timeline
        .set(curtain, { autoAlpha: 1, xPercent: -112 })
        .to(curtain, { xPercent: 0, duration: 0.2, ease: 'power3.in' })
        .to(curtain, { xPercent: 112, duration: 0.32, ease: 'power3.out' }, '+=0.02')
        .set(curtain, { autoAlpha: 0 })

      return () => timeline.kill()
    },
    { scope: root, dependencies: [route, reducedMotion], revertOnUpdate: true }
  )

  return <div ref={root} className="route-transition" aria-hidden="true" />
}
