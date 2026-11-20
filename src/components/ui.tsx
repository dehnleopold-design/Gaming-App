import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/util'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
}) {
  const hasText = children !== undefined && children !== null && children !== false
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'h-8 text-[13px]',
        size === 'md' && 'h-9 text-sm',
        size === 'lg' && 'h-12 text-base',
        hasText && size === 'sm' && 'px-2.5',
        hasText && size === 'md' && 'px-3.5',
        hasText && size === 'lg' && 'px-6',
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent/85',
        variant === 'secondary' && 'border border-line bg-surface text-fg hover:border-muted/60 hover:bg-raised',
        variant === 'ghost' && 'text-muted hover:bg-raised hover:text-fg',
        variant === 'danger' && 'border border-danger/40 text-danger hover:bg-danger/10',
        !hasText && size === 'sm' && 'w-8',
        !hasText && size === 'md' && 'w-9',
        !hasText && size === 'lg' && 'w-12',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'lg' ? 20 : 16} strokeWidth={2} className="shrink-0" aria-hidden />}
      {children}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-fg transition-transform',
            checked ? 'translate-x-[18px] bg-on-accent' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  className,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label?: string
  format?: (v: number) => string
  className?: string
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-muted">{label}</span>
          <span className="font-mono text-xs text-fg">{format ? format(value) : value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
        className="w-full"
      />
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Section({ title, children, aside, className }: { title?: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-line bg-surface', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <Icon size={28} className="text-muted" strokeWidth={1.5} aria-hidden />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-md border-l-2 px-3 py-2 text-[13px] leading-relaxed',
        tone === 'info' && 'border-muted bg-raised text-muted',
        tone === 'warn' && 'border-accent bg-accent/10 text-fg',
        tone === 'ok' && 'border-ok bg-ok/10 text-fg',
      )}
    >
      {children}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-6" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'max-h-[90vh] w-full overflow-y-auto rounded-t-xl border border-line bg-surface md:rounded-xl',
          wide ? 'md:max-w-2xl' : 'md:max-w-md',
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Schließen" />
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  label?: string
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="label">{label}</span>}
      <select className="field appearance-none pr-8" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Pegelanzeige (0–1). */
export function LevelMeter({ level, label }: { level: number; label: string }) {
  const pct = Math.min(1, level) * 100
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px] text-muted">
        <span>{label}</span>
        <span className="font-mono">{level > 0.001 ? `${(20 * Math.log10(level)).toFixed(0)} dB` : '–∞'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-75', pct > 90 ? 'bg-danger' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
