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

      // Pure cross-fade: no rotation, no scaling, no progress sweep. Opacity
      // alone never resamples the backdrop, so the intro costs almost nothing
      // and reads as a brief brand breath (~0.5s) instead of a performance.
      timeline
        .set(app, { autoAlpha: 0 })
        .addLabel('reveal', 0)
        .fromTo('[data-startup-mark]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.24 }, 'reveal')
        .fromTo('[data-startup-ring="outer"]', { autoAlpha: 0 }, { autoAlpha: 0.7, duration: 0.28 }, 'reveal+=0.04')
        .fromTo('[data-startup-ring="inner"]', { autoAlpha: 0 }, { autoAlpha: 0.44, duration: 0.24 }, 'reveal+=0.08')
        .fromTo('[data-startup-wordmark]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 'reveal+=0.1')
        .fromTo('[data-startup-caption]', { autoAlpha: 0 }, { autoAlpha: 0.78, duration: 0.18 }, 'reveal+=0.16')
        .addLabel('handoff', '+=0.06')
        .to('[data-startup-stage]', { autoAlpha: 0, duration: 0.16, ease: 'power1.in' }, 'handoff')
        .to(app, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, 'handoff')
        .to(overlay, { autoAlpha: 0, duration: 0.18, ease: 'power1.in' }, 'handoff')

      return () => timeline.kill()
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
        <div className="startup-intro-progress" aria-hidden="true">
          <span data-startup-progress />
        </div>
      </div>
    </div>
  )
}
