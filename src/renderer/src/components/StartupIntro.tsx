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
        .addLabel('reveal', 0)
        .fromTo('[data-startup-mark]', { autoAlpha: 0, scale: 0.62, y: 18 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.56, ease: 'back.out(1.35)' }, 'reveal')
        .fromTo('[data-startup-ring="outer"]', { autoAlpha: 0, scale: 0.42, rotation: -90 }, { autoAlpha: 0.76, scale: 1, rotation: 0, duration: 0.68 }, 'reveal+=0.06')
        .fromTo('[data-startup-ring="inner"]', { autoAlpha: 0, scale: 0.5, rotation: 120 }, { autoAlpha: 0.48, scale: 1, rotation: 0, duration: 0.6 }, 'reveal+=0.14')
        .fromTo('[data-startup-wordmark]', { autoAlpha: 0, y: 18, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.42 }, 'reveal+=0.32')
        .fromTo('[data-startup-caption]', { autoAlpha: 0, y: 8 }, { autoAlpha: 0.78, y: 0, duration: 0.28 }, 'reveal+=0.48')
        .fromTo('[data-startup-progress]', { scaleX: 0 }, { scaleX: 1, duration: 0.56, ease: 'power2.inOut' }, 'reveal+=0.56')
        .addLabel('handoff', '+=0.18')
        .to('[data-startup-stage]', { autoAlpha: 0, scale: 0.95, duration: 0.25, ease: 'power2.in' }, 'handoff')
        .to(app, { autoAlpha: 1, duration: 0.42, ease: 'power2.out' }, 'handoff')
        .to(overlay, { autoAlpha: 0, duration: 0.34, ease: 'power2.in' }, 'handoff+=0.08')

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
