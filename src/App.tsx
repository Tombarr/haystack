import { useEffect, useRef, useState } from 'react'
import ProgressBar from './components/ProgressBar'
import ModelSelector, { type ModelSpec } from './components/ModelSelector'
import SearchInput from './components/SearchInput'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

// ── DETECTION HOOK ──────────────────────────────────────────
// Add recording, API calls, or webhooks inside this function.
function onDetection(score: number, prompt: string): void {
  console.log(`[haystack] MATCH: ${score.toFixed(3)} — "${prompt}"`)
}
// ────────────────────────────────────────────────────────────

const CAPTURE_SIZE = 224

const MODELS: ModelSpec[] = [
  { id: 'Xenova/clip-vit-base-patch32', label: 'CLIP ViT-B/32', size: '~90 MB' },
  { id: 'Xenova/clip-vit-base-patch16', label: 'CLIP ViT-B/16', size: '~360 MB' },
  { id: 'Xenova/clip-vit-large-patch14', label: 'CLIP ViT-L/14', size: '~900 MB' },
  { id: 'Xenova/siglip-base-patch16-224', label: 'SigLIP B/16', size: '~370 MB' },
]

export default function App() {
  const [selectedModel, setSelectedModel] = useState(() => {
    const saved = localStorage.getItem('haystack-model')
    return MODELS.some((m) => m.id === saved) ? saved! : MODELS[0].id
  })
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [loadProgress, setLoadProgress] = useState(0)
  const [prompt, setPrompt] = useState(() => {
    return localStorage.getItem('haystack-prompt') || ''
  })
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem('haystack-threshold')
    return saved ? parseFloat(saved) : 0.6
  })
  const [score, setScore] = useState(0)
  const [isMatch, setIsMatch] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const isInferringRef = useRef(false)
  const promptRef = useRef(prompt)
  const thresholdRef = useRef(threshold)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMatchRef = useRef(false)
  // Camera is started once on first model-ready; stays on during model switches
  const cameraStartedRef = useRef(false)

  // Initialize Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

    const progressMap = new Map<string, number>()

    workerRef.current.onmessage = (e) => {
      const { type, data } = e.data
      switch (type) {
        case 'progress':
          if (data.status === 'progress' && data.progress != null && data.file) {
            progressMap.set(data.file, data.progress)
            const total = Array.from(progressMap.values()).reduce((a, b) => a + b, 0)
            const avg = total / progressMap.size
            setLoadProgress(Math.round(avg))
          }
          break
        case 'ready':
          setModelStatus('ready')
          setLoadProgress(100)
          break
        case 'error':
          setModelStatus('error')
          break
      }
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  // Keep refs in sync with state and update worker prompt
  useEffect(() => {
    promptRef.current = prompt
    localStorage.setItem('haystack-prompt', prompt)
    workerRef.current?.postMessage({ type: 'updatePrompt', data: { prompt } })

    if (!prompt.trim()) {
      setScore(0)
      setIsMatch(false)
      prevMatchRef.current = false
      isInferringRef.current = false
    }
  }, [prompt, modelStatus])

  useEffect(() => {
    thresholdRef.current = threshold
    localStorage.setItem('haystack-threshold', threshold.toString())
  }, [threshold])

  useEffect(() => {
    localStorage.setItem('haystack-model', selectedModel)
  }, [selectedModel])

  // Load (or reload) model whenever selectedModel changes
  useEffect(() => {
    setModelStatus('loading')
    setLoadProgress(0)
    setScore(0)
    setIsMatch(false)
    prevMatchRef.current = false
    workerRef.current?.postMessage({ type: 'load', data: { modelId: selectedModel } })
  }, [selectedModel])

  // Start camera once, on the first time the model becomes ready

  useEffect(() => {
    if (modelStatus !== 'ready' || cameraStartedRef.current) return
    cameraStartedRef.current = true

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
  }, [modelStatus])

  // Inference loop — restarts each time modelStatus becomes 'ready'
  useEffect(() => {
    if (modelStatus !== 'ready' || !workerRef.current) return

    function scheduleNext() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(runInference, 0)
    }

    const progressMap = new Map<string, number>()

    workerRef.current.onmessage = (e) => {
      const { type, data } = e.data
      switch (type) {
        case 'progress':
          if (data.status === 'progress' && data.progress != null && data.file) {
            progressMap.set(data.file, data.progress)
            const total = Array.from(progressMap.values()).reduce((a, b) => a + b, 0)
            const avg = total / progressMap.size
            setLoadProgress(Math.round(avg))
          }
          break
        case 'ready':
          setModelStatus('ready')
          setLoadProgress(100)
          break
        case 'error':
          setModelStatus('error')
          break
        case 'score':
          const { score: newScore } = data
          setScore(newScore)
          const matched = newScore > thresholdRef.current
          setIsMatch(matched)
          if (matched && !prevMatchRef.current) {
            onDetection(newScore, promptRef.current.trim())
          }
          prevMatchRef.current = matched
          isInferringRef.current = false
          scheduleNext()
          break
        case 'inference-skipped':
          isInferringRef.current = false
          scheduleNext()
          break
      }
    }

    async function runInference() {
      const currentPrompt = promptRef.current.trim()

      if (!currentPrompt || modelStatus !== 'ready' || !workerRef.current) {
        // If not ready or no prompt, wait and try again in 100ms
        timerRef.current = setTimeout(runInference, 100)
        return
      }

      if (isInferringRef.current) {
        // Already inferring, do nothing; the onmessage handler will schedule the next run
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || video.readyState < 2 || !canvas) {
        timerRef.current = setTimeout(runInference, 100)
        return
      }

      if (!ctxRef.current) {
        ctxRef.current = canvas.getContext('2d', { willReadFrequently: true })
      }
      const ctx = ctxRef.current!

      try {
        ctx.drawImage(video, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE)
        const imageData = ctx.getImageData(0, 0, CAPTURE_SIZE, CAPTURE_SIZE)

        isInferringRef.current = true
        workerRef.current.postMessage(
          {
            type: 'inference',
            data: {
              imageData: imageData.data.buffer,
              captureSize: CAPTURE_SIZE,
            },
          },
          [imageData.data.buffer]
        )
      } catch (err) {
        console.error('[haystack] Inference setup error:', err)
        isInferringRef.current = false
        scheduleNext()
      }
    }

    requestAnimationFrame(scheduleNext)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [modelStatus])

  const hasPrompt = prompt.trim().length > 0
  const currentModel = MODELS.find((m) => m.id === selectedModel) ?? MODELS[0]

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">

      {/* Video — always in DOM; fills entire viewport */}
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

      {/* Glassmorphism search pill — top center */}
      <div className="absolute top-[50px] left-1/2 -translate-x-1/2 w-[90%] max-w-[800px] z-10">
        <SearchInput
          value={prompt}
          onChange={setPrompt}
          onClear={() => setPrompt('')}
          score={score}
          isMatch={isMatch}
          hasPrompt={hasPrompt}
        />
      </div>

      {/* Model selector — bottom center */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <ModelSelector
          models={MODELS}
          selected={selectedModel}
          disabled={modelStatus === 'loading'}
          onChange={setSelectedModel}
        />
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-sm p-8 text-center pointer-events-none">
          {cameraError}
        </div>
      )}

      {/* Loading screen — initial load and model switches */}
      {modelStatus === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/95 gap-4 p-8">
          <h1 className="text-2xl font-bold text-white">
            Haystack <span className="text-yellow-400">▲</span>
          </h1>
          <div className="w-full max-w-sm">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300 font-medium">{currentModel.label}</span>
              <span className="text-gray-500 font-mono">{loadProgress}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-2 text-center">
              {currentModel.size} — downloaded once, then cached offline
            </p>
          </div>
        </div>
      )}

      {/* Error screen */}
      {modelStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 p-8">
          <div className="w-full max-w-sm bg-red-900/40 border border-red-700 rounded p-4 text-red-300 text-sm text-center">
            Failed to load {currentModel.label}. Check your network and reload.
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
