import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CaretDown, Check } from '@phosphor-icons/react'
import { useAppStore, type ContextMenuItem } from '../store'

/* ---------- Button (thin wrapper, styles from app.css) ---------- */
export function Button({
  variant = 'secondary',
  size,
  children,
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm'
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : ''].filter(Boolean).join(' ')
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  )
}

/* ---------- Modal ---------- */
export function Modal({
  title,
  onClose,
  children,
  footer
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="modal-overlay motion-backdrop-enter" onClick={onClose}>
      <div
        className="modal motion-modal-enter"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Confirm modal with change list (From/To, counts) ---------- */
export interface ConfirmDetail {
  label: string
  value: string
}

export function ConfirmModal({
  title,
  message,
  details,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onClose
}: {
  title: string
  message: string
  details?: ConfirmDetail[]
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              try {
                onConfirm()
              } finally {
                onClose()
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-2)', marginBottom: 'var(--space-4)' }}>
        {message}
      </p>
      {details && details.length > 0 && (
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          {details.map((d) => (
            <div key={d.label}>
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-3)' }}>{d.label}</div>
              <div style={{ fontSize: 'var(--fs-body-sm)', wordBreak: 'break-all' }}>{d.value}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon && <div style={{ color: 'var(--text-3)' }}>{icon}</div>}
      <div>{title}</div>
      {hint && <div className="hint">{hint}</div>}
      {action && <div style={{ marginTop: '0.5rem' }}>{action}</div>}
    </div>
  )
}

/* ---------- Select (stylized dropdown, replaces native <select>) ----------
   Closed control renders as a hairline control; the list opens as a floating
   glass panel. Selected item is marked with a leading accent check. */
export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
  /** Compact label shown on the closed trigger when the full label is long. */
  shortLabel?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled,
  style,
  className,
  menuMinWidth
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  style?: CSSProperties
  className?: string
  /** Minimum open-menu width — use when item labels are much longer than the trigger. */
  menuMinWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; opensUp: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  // The panel is portaled to <body> (see below) because the trigger often sits
  // inside a backdrop-filter/transform container — which would otherwise hijack
  // position:fixed. Coords are viewport-relative, measured fresh on open and
  // on scroll/resize so the menu stays glued to the trigger.
  const computePos = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuHeight = Math.min(options.length * 32 + 12, 300)
    const spaceBelow = window.innerHeight - 12 - (r.bottom + 6)
    const opensUp = spaceBelow < Math.min(menuHeight, 220)
    const top = opensUp ? Math.max(12, r.top - 6 - menuHeight) : r.bottom + 6
    const width = Math.max(148, menuMinWidth ?? 0, r.width)
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - width))
    setPos({ left, top, width, opensUp })
  }

  const openPanel = () => {
    computePos()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => computePos()
    const onResize = () => computePos()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, options.length])

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`dd-trigger ${open ? 'dd-open' : ''} ${className ?? ''}`}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className="dd-value">{selected ? selected.shortLabel ?? selected.label : placeholder}</span>
        <CaretDown size={14} weight="bold" className={`dd-caret ${open ? 'dd-caret-open' : ''}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="dd-menu"
            role="listbox"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width, transformOrigin: pos.opensUp ? 'bottom left' : 'top left' }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`dd-item ${o.value === value ? 'dd-item-selected' : ''}`}
                disabled={o.disabled}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                <span className="dd-check">{o.value === value ? <Check size={13} weight="bold" /> : null}</span>
                <span className="dd-label">{o.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

/* ---------- Badge ---------- */
export function Badge({ kind, children }: { kind: 'available' | 'missing' | 'warning' | 'neutral' | 'accent'; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>
}

/* ---------- Toast stack ---------- */
export function ToastStack() {
  const toasts = useAppStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-dot" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Context menu overlay ---------- */
export function ContextMenuOverlay() {
  const menu = useAppStore((s) => s.contextMenu)
  const hide = useAppStore((s) => s.hideContextMenu)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, hide])

  if (!menu) return null

  // Keep the menu inside the viewport
  const x = Math.min(menu.x, window.innerWidth - 200)
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 24)

  return (
    <div className="context-menu" ref={ref} style={{ left: x, top: y }}>
      {menu.items.map((item, i) =>
        item.separatorBefore ? (
          <div key={i}>
            <div className="context-menu-sep" />
            <MenuButton item={item} />
          </div>
        ) : (
          <MenuButton key={i} item={item} />
        )
      )}
    </div>
  )
}

function MenuButton({ item }: { item: ContextMenuItem }) {
  const hide = useAppStore((s) => s.hideContextMenu)
  return (
    <button
      className={`context-menu-item ${item.danger ? 'danger' : ''}`}
      onClick={() => {
        hide()
        item.onClick()
      }}
    >
      {item.icon}
      {item.label}
    </button>
  )
}
