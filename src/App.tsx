import { useEffect, useRef, useState } from 'react'
import { env, pipeline, type ZeroShotImageClassificationPipeline } from '@xenova/transformers'
import ProgressBar from './components/ProgressBar'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

// ── DETECTION HOOK ──────────────────────────────────────────
// Add recording, API calls, or webhooks inside this function.
function onDetection(score: number, prompt: string): void {
  console.log(`[haystack] MATCH: ${score.toFixed(3)} — "${prompt}"`)
}
// ────────────────────────────────────────────────────────────

const INFERENCE_INTERVAL_MS = 300
const CAPTURE_SIZE = 224

export default function App() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [loadProgress, setLoadProgress] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [threshold, setThreshold] = useState(0.6)
  const [score, setScore] = useState(0)
  const [isMatch, setIsMatch] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pipelineRef = useRef<ZeroShotImageClassificationPipeline | null>(null)
  const isInferringRef = useRef(false)
  const promptRef = useRef(prompt)
  const thresholdRef = useRef(threshold)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMatchRef = useRef(false)

  // Keep refs in sync with state
  useEffect(() => { promptRef.current = prompt }, [prompt])
  useEffect(() => { thresholdRef.current = threshold }, [threshold])

  // Load model on mount
  useEffect(() => {
    env.allowLocalModels = false
    setModelStatus('loading')

    pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
      progress_callback: (progress: { status: string; progress?: number }) => {
        if (progress.status === 'progress' && progress.progress != null) {
          setLoadProgress(Math.round(progress.progress))
        }
      },
    })
      .then((pipe) => {
        pipelineRef.current = pipe as ZeroShotImageClassificationPipeline
        setModelStatus('ready')
        setLoadProgress(100)
      })
      .catch((err: unknown) => {
        console.error('[haystack] Model load failed:', err)
        setModelStatus('error')
      })
  }, [])

  // Start camera once model is ready
  useEffect(() => {
    if (modelStatus !== 'ready') return

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setCameraError(`Camera unavailable: ${msg}`)
      })

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [modelStatus])

  // Inference loop — starts after model is ready
  useEffect(() => {
    if (modelStatus !== 'ready') return

    function scheduleNext() {
      timerRef.current = setTimeout(runInference, INFERENCE_INTERVAL_MS)
    }

    async function runInference() {
      const currentPrompt = promptRef.current.trim()
      const currentThreshold = thresholdRef.current

      // No prompt — clear state and idle
      if (!currentPrompt) {
        setScore(0)
        setIsMatch(false)
        prevMatchRef.current = false
        scheduleNext()
        return
      }

      if (isInferringRef.current || !pipelineRef.current) {
        scheduleNext()
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || video.readyState < 2 || !canvas) {
        scheduleNext()
        return
      }

      isInferringRef.current = true
      let blobUrl: string | null = null

      try {
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE)

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.85)
        )
        if (!blob) throw new Error('canvas.toBlob returned null')

        blobUrl = URL.createObjectURL(blob)

        type ClipResult = { label: string; score: number }
        const raw = await pipelineRef.current(blobUrl, [currentPrompt, 'something else'])
        const results = (Array.isArray(raw[0]) ? raw[0] : raw) as ClipResult[]
        const match = results.find((r) => r.label === currentPrompt)
        const newScore = match?.score ?? 0

        setScore(newScore)

        const matched = newScore > currentThreshold
        setIsMatch(matched)

        // Fire detection hook on rising edge only
        if (matched && !prevMatchRef.current) {
          onDetection(newScore, currentPrompt)
        }
        prevMatchRef.current = matched
      } catch (err) {
        console.error('[haystack] Inference error:', err)
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        isInferringRef.current = false
        scheduleNext()
      }
    }

    scheduleNext()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [modelStatus])

  const hasPrompt = prompt.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">

      {/* Video — always in DOM so the ref is available; fills entire viewport */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Match overlay — pulsing while score is above threshold */}
      {isMatch && (
        <div className="absolute inset-0 pointer-events-none animate-pulse-match bg-yellow-400/25" />
      )}

      {/* Vertical probability bar — right edge, full height */}
      <div className="absolute right-0 top-0 bottom-0 w-14">
        <ProgressBar
          score={score}
          threshold={threshold}
          isMatch={isMatch}
          hasPrompt={hasPrompt}
          onThresholdChange={setThreshold}
        />
      </div>

      {/* Glassmorphism pill — centered over video */}
      <div className="absolute top-[50px] left-1/2 -translate-x-1/2 w-[90%] max-w-[800px] z-10">
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
            width="24" height="24" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          {/* Text input */}
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
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

          {/* Clear button (shown when text present) / arrow (when empty) */}
          {hasPrompt ? (
            <button
              onClick={() => setPrompt('')}
              className="shrink-0 text-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
              aria-label="Clear prompt"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          ) : (
            <svg
              className="shrink-0 text-blue-300"
              width="26" height="26" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </div>
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-sm p-8 text-center pointer-events-none">
          {cameraError}
        </div>
      )}

      {/* Loading screen — covers video until model is ready */}
      {modelStatus === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 gap-4 p-8">
          <h1 className="text-2xl font-bold text-white">
            Haystack <span className="text-yellow-400">▲</span>
          </h1>
          <div className="w-full max-w-sm">
            <p className="text-sm text-gray-400 mb-2 text-center">
              Loading CLIP model… {loadProgress}%
            </p>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-2 text-center">
              ~90 MB downloaded once, then cached offline
            </p>
          </div>
        </div>
      )}

      {/* Error screen */}
      {modelStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 p-8">
          <div className="w-full max-w-sm bg-red-900/40 border border-red-700 rounded p-4 text-red-300 text-sm text-center">
            Failed to load CLIP model. Check your network and reload.
          </div>
        </div>
      )}

      {/* Hidden capture canvas */}
      <canvas
        ref={canvasRef}
        width={CAPTURE_SIZE}
        height={CAPTURE_SIZE}
        className="hidden"
      />
    </div>
  )
}
