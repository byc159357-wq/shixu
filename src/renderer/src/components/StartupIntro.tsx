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
 * A short, non-blocking brand reveal shown once for each application launch.
 * It only animates opacity and transforms; the workspace is already mounted
 * behind it, so startup data continues loading during the sequence.
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

      const timeline = gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete
      })

      timeline
        .set(app, { autoAlpha: 0 })
        .fromTo('[data-startup-mark]', { autoAlpha: 0, scale: 0.86, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.38 })
        .fromTo('[data-startup-wordmark]', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.28 }, '-=0.18')
        .fromTo('[data-startup-caption]', { autoAlpha: 0, y: 5 }, { autoAlpha: 0.72, y: 0, duration: 0.22 }, '-=0.12')
        .fromTo('[data-startup-progress]', { scaleX: 0 }, { scaleX: 1, duration: 0.36, ease: 'power2.inOut' }, '-=0.12')
        .to(app, { autoAlpha: 1, duration: 0.26, ease: 'power2.out' }, '-=0.1')
        .to(overlay, { autoAlpha: 0, duration: 0.22, ease: 'power2.in' }, '-=0.12')

      return () => timeline.kill()
    },
    { scope: root, dependencies: [reducedMotion], revertOnUpdate: true }
  )

  return (
    <div ref={root} className="startup-intro" aria-hidden="true">
      <div className="startup-intro-stage">
        <div className="startup-intro-mark" data-startup-mark>
          <Logo size={54} />
        </div>
        <div className="startup-intro-wordmark" data-startup-wordmark>拾序</div>
        <div className="startup-intro-caption" data-startup-caption>整理此刻，续写下一步</div>
        <div className="startup-intro-progress" aria-hidden="true">
          <span data-startup-progress />
        </div>
      </div>
    </div>
  )
}
