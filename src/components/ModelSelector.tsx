import { useEffect, useRef, useState } from 'react'

export interface ModelSpec {
  id: string
  label: string
  size: string
}

interface ModelSelectorProps {
  models: ModelSpec[]
  selected: string
  disabled: boolean
  onChange: (id: string) => void
}

const glassStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
}

export default function ModelSelector({ models, selected, disabled, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = models.find((m) => m.id === selected) ?? models[0]

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={rootRef} className="relative">

      {/* Trigger pill */}
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-2.5 px-5 py-2.5 rounded-full border border-white/30
          transition-opacity duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer"
        style={{ ...glassStyle, minWidth: '240px' }}
      >
        <span className="text-sm font-medium text-gray-700">{current.label}</span>
        <span className="text-[11px] font-mono text-gray-400 bg-gray-100/80 rounded-full px-2 py-0.5">
          {current.size}
        </span>
        <svg
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown panel — opens upward */}
      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 min-w-full rounded-2xl
            border border-white/30 overflow-hidden z-20"
          style={{ ...glassStyle, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', minWidth: '240px' }}
        >
          {models.map((m) => {
            const isCurrent = m.id === selected
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                className={`flex items-center gap-3 w-full px-5 py-3 text-left
                  transition-colors duration-100 hover:bg-black/5
                  ${isCurrent ? 'bg-blue-50/60' : ''}`}
              >
                {/* Checkmark — reserves space even when not selected */}
                <span className="w-4 shrink-0 flex items-center justify-center">
                  {isCurrent && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="#5b7fff" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span className={`text-sm font-medium ${isCurrent ? 'text-blue-500' : 'text-gray-700'}`}>
                  {m.label}
                </span>
                <span className="ml-auto text-[11px] font-mono text-gray-400 bg-gray-100/80 rounded-full px-2 py-0.5 shrink-0">
                  {m.size}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
