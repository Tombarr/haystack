import { useState, useEffect, useRef } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  score: number
  isMatch: boolean
  hasPrompt: boolean
  debounceMs?: number
}

export default function SearchInput({
  value,
  onChange,
  onClear,
  score,
  isMatch,
  hasPrompt,
  debounceMs = 1000,
}: SearchInputProps) {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync internal state when parent value changes (e.g., cleared)
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange(val)
    }, debounceMs)
  }

  const handleClear = () => {
    setInputValue('')
    if (timerRef.current) clearTimeout(timerRef.current)
    onClear()
  }

  return (
    <div
      className="flex items-center px-6 py-3 rounded-full border border-white/30
        transition-shadow duration-200"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Search icon */}
      <svg
        className="shrink-0 text-gray-400"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      {/* Text input */}
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        className="flex-1 mx-4 bg-transparent border-none outline-none
          text-[22px] text-gray-800 placeholder:text-gray-400"
        placeholder="Describe what to detect…"
      />

      {/* Score — shown while a prompt is active */}
      {hasPrompt && (
        <span
          className={`shrink-0 mr-3 text-sm font-mono transition-colors duration-150 ${
            isMatch ? 'text-yellow-500 font-semibold' : 'text-gray-400'
          }`}
        >
          {(score * 100).toFixed(1)}%
        </span>
      )}

      {/* Clear (when text present) / decorative arrow (when empty) */}
      {inputValue.trim().length > 0 ? (
        <button
          onClick={handleClear}
          className="shrink-0 text-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
          aria-label="Clear prompt"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </button>
      ) : (
        <svg
          className="shrink-0 text-blue-300"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      )}
    </div>
  )
}
