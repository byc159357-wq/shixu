import type { ReactNode } from 'react'

export function HermesShell({
  variant,
  children,
  className = ''
}: {
  variant: 'full' | 'floating'
  children: ReactNode
  className?: string
}) {
  return <div className={`hermes-shell hermes-shell-${variant} ${className}`.trim()}>{children}</div>
}
