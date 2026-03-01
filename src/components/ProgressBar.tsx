import React, { useRef } from 'react'

interface ProgressBarProps {
  score: number
  threshold: number
  isMatch: boolean
  hasPrompt: boolean
  onThresholdChange: (v: number) => void
}

export default function ProgressBar({
  score,
  threshold,
  isMatch,
  hasPrompt,
  onThresholdChange,
}: ProgressBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const toThreshold = (clientY: number): number => {
    const rect = containerRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    containerRef.current!.setPointerCapture(e.pointerId)
    onThresholdChange(toThreshold(e.clientY))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return
    onThresholdChange(toThreshold(e.clientY))
  }

  const fillPct = score * 100
  const thresholdPct = threshold * 100

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black/50 cursor-ns-resize select-none backdrop-blur-sm"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* Score fill — grows from bottom */}
      {hasPrompt && (
        <div
          className={`absolute bottom-0 left-0 right-0 transition-all duration-150 ${
            isMatch ? 'bg-yellow-400/70' : 'bg-blue-500/70'
          }`}
          style={{ height: `${fillPct}%` }}
        />
      )}

      {/* Threshold line */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ bottom: `${thresholdPct}%` }}
      >
        <div className="w-full h-0.5 bg-yellow-400" />
        {/* Diamond drag handle */}
        <div className="absolute right-1 -top-2 w-4 h-4 bg-yellow-400 rotate-45" />
        {/* Threshold label */}
        <div className="absolute right-7 -top-3 text-yellow-400 text-xs font-mono leading-none whitespace-nowrap">
          {thresholdPct.toFixed(0)}%
        </div>
      </div>
    </div>
  )
}
