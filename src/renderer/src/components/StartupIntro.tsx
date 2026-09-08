import { useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Logo } from './Logo'

gsap.registerPlugin(useGSAP)

interface StartupIntroProps {
  appRoot: RefObject<HTMLElement | null>
  reducedMotion: boolean
  onComplete: () => void
}

/**
 * A visible brand handoff shown once for each application process launch.
 * The workspace is mounted behind the curtain and keeps loading, while the
 * launch layer remains long enough to be perceived as an intentional opening.
 */
export function StartupIntro({ appRoot, reducedMotion, onComplete }: StartupIntroProps) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const overlay = root.current
      const app = appRoot.current
      if (!overlay) return

      if (reducedMotion) {
        gsap.set(app, { autoAlpha: 1 })
        onComplete()
        return
      }

      let timeline: gsap.core.Timeline | null = null
      let cancelled = false

      // BrowserWindow is created hidden and only becomes visible at
      // `ready-to-show`. Waiting here prevents the whole intro from playing
      // behind an invisible native window, which made it look like nothing
      // happened on cold launch.
      const start = () => {
        if (cancelled) return
        timeline = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete
        })

        // Establish every start state explicitly. This prevents a fast first
        // paint from making the reveal appear to have already finished.
        timeline
          .set(app, { autoAlpha: 0 })
          .set('[data-startup-stage]', { autoAlpha: 1, scale: 0.82, y: 24 })
          .set('[data-startup-mark]', { autoAlpha: 0, scale: 0.72, y: 16 })
          .set('[data-startup-ring="outer"]', { autoAlpha: 0, scale: 0.42, rotation: -70 })
          .set('[data-startup-ring="inner"]', { autoAlpha: 0, scale: 0.5, rotation: 90 })
          .set('[data-startup-wordmark]', { autoAlpha: 0, y: 24 })
          .set('[data-startup-caption]', { autoAlpha: 0, y: 10 })
          .set('[data-startup-scan]', { autoAlpha: 0, xPercent: -100 })
          .set('[data-startup-progress]', { scaleX: 0 })
          .addLabel('reveal', 0)
          .to('[data-startup-mark]', { autoAlpha: 1, scale: 1, y: 0, duration: 0.68, ease: 'back.out(1.4)' }, 'reveal')
          .to('[data-startup-ring="outer"]', { autoAlpha: 0.82, scale: 1.08, rotation: 120, duration: 1.08, ease: 'power3.out' }, 'reveal+=0.08')
          .to('[data-startup-ring="inner"]', { autoAlpha: 0.5, scale: 1, rotation: -90, duration: 0.84, ease: 'power2.out' }, 'reveal+=0.18')
          .to('[data-startup-wordmark]', { autoAlpha: 1, y: 0, duration: 0.48, ease: 'power2.out' }, 'reveal+=0.56')
          .to('[data-startup-caption]', { autoAlpha: 0.78, y: 0, duration: 0.36, ease: 'power2.out' }, 'reveal+=0.78')
          .to('[data-startup-scan]', { autoAlpha: 0.65, xPercent: 100, duration: 0.9, ease: 'power2.inOut' }, 'reveal+=0.46')
          .to('[data-startup-progress]', { scaleX: 1, duration: 0.86, ease: 'power2.inOut' }, 'reveal+=0.76')
          .addLabel('handoff', '+=0.2')
          .to('[data-startup-stage]', { autoAlpha: 0, y: -18, scale: 1.03, duration: 0.34, ease: 'power2.in' }, 'handoff')
          .to(app, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, 'handoff+=0.02')
          .to(overlay, { autoAlpha: 0, duration: 0.42, ease: 'power2.in' }, 'handoff+=0.08')
      }

      if (document.visibilityState === 'hidden') {
        const onVisible = () => {
          document.removeEventListener('visibilitychange', onVisible)
          window.removeEventListener('workdeck:window-visible', onVisible)
          start()
        }
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('workdeck:window-visible', onVisible)
        return () => {
          cancelled = true
          document.removeEventListener('visibilitychange', onVisible)
          window.removeEventListener('workdeck:window-visible', onVisible)
          timeline?.kill()
        }
      }

      start()
      return () => {
        cancelled = true
        timeline?.kill()
      }
    },
    { scope: root, dependencies: [reducedMotion], revertOnUpdate: true }
  )

  return (
    <div ref={root} className="startup-intro" aria-hidden="true">
      <div className="startup-intro-stage" data-startup-stage>
        <div className="startup-intro-mark" data-startup-mark>
          <span className="startup-intro-ring startup-intro-ring-outer" data-startup-ring="outer" />
          <span className="startup-intro-ring startup-intro-ring-inner" data-startup-ring="inner" />
          <Logo size={68} />
        </div>
        <div className="startup-intro-wordmark" data-startup-wordmark>拾序</div>
        <div className="startup-intro-caption" data-startup-caption>整理此刻，续写下一步</div>
        <span className="startup-intro-scan" data-startup-scan aria-hidden="true" />
        <div className="startup-intro-progress" aria-hidden="true">
          <span data-startup-progress />
        </div>
      </div>
    </div>
  )
}
