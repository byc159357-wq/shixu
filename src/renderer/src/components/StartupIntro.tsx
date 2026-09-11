import { useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Logo } from './Logo'

gsap.registerPlugin(useGSAP)

interface StartupIntroProps {
  appRoot: RefObject<HTMLElement | null>
  theme: 'dark' | 'light'
  reducedMotion: boolean
  onComplete: () => void
}

/**
 * A visible brand handoff shown once for each application process launch.
 * The workspace is mounted behind the curtain and keeps loading, while the
 * launch layer remains long enough to be perceived as an intentional opening.
 */
export function StartupIntro({ appRoot, theme, reducedMotion, onComplete }: StartupIntroProps) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const overlay = root.current
      const app = appRoot.current
      if (!overlay) return

      let timeline: gsap.core.Timeline | null = null
      let cancelled = false

      // BrowserWindow is created hidden and only becomes visible at
      // `ready-to-show`. In Electron, document.visibilityState is not
      // guaranteed to change for a hidden BrowserWindow, so the renderer
      // waits for the explicit native handoff event instead of guessing.
      const start = () => {
        if (cancelled) return
        timeline = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete
        })

        if (reducedMotion) {
          // Keep a perceivable but vestibular-safe handoff for users who
          // prefer reduced motion: opacity only, no scale/rotation/translation.
          timeline
            .set(app, { autoAlpha: 0 })
            .set('[data-startup-grid]', { autoAlpha: 0.35 })
            .set('[data-startup-stage]', { autoAlpha: 1 })
            .set('[data-startup-panel]', { autoAlpha: 1 })
            .set('[data-startup-mark]', { autoAlpha: 0 })
            .set('[data-startup-dot]', { autoAlpha: 0 })
            .set('[data-startup-kicker]', { autoAlpha: 0 })
            .set('[data-startup-wordmark]', { autoAlpha: 0 })
            .set('[data-startup-caption]', { autoAlpha: 0 })
            .set('[data-startup-status]', { autoAlpha: 0 })
            .set('[data-startup-scan]', { autoAlpha: 0 })
            .set('[data-startup-progress]', { scaleX: 0 })
            .to('[data-startup-mark]', { autoAlpha: 1, duration: 0.4, ease: 'power1.out' })
            .to('[data-startup-dot]', { autoAlpha: 1, duration: 0.22, ease: 'power1.out' }, '-=0.12')
            .to('[data-startup-kicker]', { autoAlpha: 1, duration: 0.24, ease: 'power1.out' }, '-=0.2')
            .to('[data-startup-wordmark]', { autoAlpha: 1, duration: 0.32, ease: 'power1.out' }, '-=0.12')
            .to('[data-startup-caption]', { autoAlpha: 0.78, duration: 0.28, ease: 'power1.out' }, '-=0.1')
            .to('[data-startup-status]', { autoAlpha: 1, duration: 0.24, ease: 'power1.out' }, '-=0.08')
            .to('[data-startup-progress]', { scaleX: 1, duration: 0.52, ease: 'power1.inOut' }, '-=0.1')
            .to('[data-startup-stage]', { autoAlpha: 0, duration: 0.26, ease: 'power1.in' }, '+=0.2')
            .to(app, { autoAlpha: 1, duration: 0.32, ease: 'power1.out' }, '<')
            .to(overlay, { autoAlpha: 0, duration: 0.24, ease: 'power1.in' }, '<0.04')
          return
        }

        // Establish every start state explicitly. This prevents a fast first
        // paint from making the reveal appear to have already finished.
        timeline
          .set(app, { autoAlpha: 0 })
          .set('[data-startup-grid]', { autoAlpha: 0 })
          .set('[data-startup-stage]', { autoAlpha: 1, scale: 0.82, y: 24 })
          .set('[data-startup-panel]', { autoAlpha: 0, y: 18, scale: 0.96 })
          .set('[data-startup-mark]', { autoAlpha: 0, scale: 0.82, rotation: -4, y: 12 })
          .set('[data-startup-dot]', { autoAlpha: 0, scale: 0.5 })
          .set('[data-startup-kicker]', { autoAlpha: 0, y: 10 })
          .set('[data-startup-wordmark]', { autoAlpha: 0, y: 24 })
          .set('[data-startup-caption]', { autoAlpha: 0, y: 10 })
          .set('[data-startup-status]', { autoAlpha: 0, y: 10 })
          .set('[data-startup-scan]', { autoAlpha: 0, xPercent: -100 })
          .set('[data-startup-progress]', { scaleX: 0 })
          .addLabel('reveal', 0)
          .to('[data-startup-grid]', { autoAlpha: 0.55, duration: 0.8, ease: 'power2.out' }, 'reveal')
          .to('[data-startup-stage]', { autoAlpha: 1, scale: 1, y: 0, duration: 0.58, ease: 'power3.out' }, 'reveal')
          .to('[data-startup-panel]', { autoAlpha: 1, scale: 1, y: 0, duration: 0.62, ease: 'back.out(1.2)' }, 'reveal+=0.05')
          .to('[data-startup-mark]', { autoAlpha: 1, scale: 1, rotation: 0, y: 0, duration: 0.62, ease: 'back.out(1.2)' }, 'reveal+=0.18')
          .to('[data-startup-dot]', { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(1.5)' }, 'reveal+=0.56')
          .to('[data-startup-kicker]', { autoAlpha: 1, y: 0, duration: 0.34, ease: 'power2.out' }, 'reveal+=0.36')
          .to('[data-startup-wordmark]', { autoAlpha: 1, y: 0, duration: 0.48, ease: 'power2.out' }, 'reveal+=0.56')
          .to('[data-startup-caption]', { autoAlpha: 0.78, y: 0, duration: 0.36, ease: 'power2.out' }, 'reveal+=0.78')
          .to('[data-startup-status]', { autoAlpha: 1, y: 0, duration: 0.34, ease: 'power2.out' }, 'reveal+=0.9')
          .to('[data-startup-scan]', { autoAlpha: 0.65, xPercent: 100, duration: 0.9, ease: 'power2.inOut' }, 'reveal+=0.46')
          .to('[data-startup-progress]', { scaleX: 1, duration: 0.86, ease: 'power2.inOut' }, 'reveal+=0.76')
          .addLabel('handoff', '+=0.2')
          .to('[data-startup-stage]', { autoAlpha: 0, y: -18, scale: 1.03, duration: 0.34, ease: 'power2.in' }, 'handoff')
          .to(app, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, 'handoff+=0.02')
          .to(overlay, { autoAlpha: 0, duration: 0.42, ease: 'power2.in' }, 'handoff+=0.08')
      }

      const isElectronWindow = typeof window.workdeck !== 'undefined'
      if (isElectronWindow) {
        const windowState = window as Window & { __workdeckWindowVisible?: boolean }
        const onVisible = () => {
          window.removeEventListener('workdeck:window-visible', onVisible)
          start()
        }
        window.addEventListener('workdeck:window-visible', onVisible)
        if (windowState.__workdeckWindowVisible) onVisible()
        return () => {
          cancelled = true
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
    <div ref={root} className="startup-intro" data-theme={theme} aria-hidden="true">
      <div className="startup-intro-grid" data-startup-grid />
      <div className="startup-intro-vignette" />
      <div className="startup-intro-stage" data-startup-stage>
        <div className="startup-intro-panel" data-startup-panel>
          <div className="startup-intro-topline">
            <span className="startup-intro-kicker" data-startup-kicker>拾序 · WORKSPACE</span>
            <span className="startup-intro-index">01 / 01</span>
          </div>
          <div className="startup-intro-identity">
            <div className="startup-intro-mark" data-startup-mark>
              <Logo size={60} />
              <span className="startup-intro-mark-status" data-startup-dot aria-hidden="true" />
            </div>
            <div className="startup-intro-copy">
              <div className="startup-intro-wordmark" data-startup-wordmark>拾序</div>
              <div className="startup-intro-caption" data-startup-caption>整理此刻，续写下一步</div>
            </div>
          </div>
          <div className="startup-intro-status" data-startup-status>
            <span className="startup-intro-status-dot" />
            <span>正在准备你的工作台</span>
            <span className="startup-intro-status-value">READY</span>
          </div>
          <div className="startup-intro-progress" aria-hidden="true">
            <span data-startup-progress />
          </div>
        </div>
        <span className="startup-intro-scan" data-startup-scan aria-hidden="true" />
      </div>
    </div>
  )
}
