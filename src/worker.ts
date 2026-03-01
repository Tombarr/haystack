import {
  env,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  AutoProcessor,
  RawImage,
  type CLIPTextModelWithProjection as CLIPTextModel,
  type CLIPVisionModelWithProjection as CLIPVisionModel,
  type Processor,
  type PreTrainedTokenizer,
  Tensor,
} from '@xenova/transformers'

let tokenizer: PreTrainedTokenizer | null = null
let textModel: CLIPTextModel | null = null
let visionModel: CLIPVisionModel | null = null
let processor: Processor | null = null
let textEmbeddings: Tensor | null = null

self.onmessage = async (e) => {
  const { type, data } = e.data

  switch (type) {
    case 'load': {
      const { modelId } = data
      env.allowLocalModels = false
      try {
        const progress_callback = (progress: { status: string; progress?: number }) => {
          self.postMessage({ type: 'progress', data: progress })
        }

        const loaded = await Promise.all([
          AutoTokenizer.from_pretrained(modelId, { progress_callback }),
          CLIPTextModelWithProjection.from_pretrained(modelId, { progress_callback }),
          CLIPVisionModelWithProjection.from_pretrained(modelId, { progress_callback }),
          AutoProcessor.from_pretrained(modelId, { progress_callback }),
        ])

        tokenizer = loaded[0] as PreTrainedTokenizer
        textModel = loaded[1] as CLIPTextModel
        visionModel = loaded[2] as CLIPVisionModel
        processor = loaded[3] as Processor

        self.postMessage({ type: 'ready' })
      } catch (err) {
        console.error('[haystack-worker] Model load failed:', err)
        self.postMessage({ type: 'error', data: err instanceof Error ? err.message : String(err) })
      }
      break
    }

    case 'updatePrompt': {
      const { prompt } = data
      if (!tokenizer || !textModel || !prompt.trim()) {
        textEmbeddings = null
        return
      }

      try {
        const inputs = tokenizer([prompt.trim(), 'something else'], {
          padding: true,
          truncation: true,
        })
        const outputs = await textModel(inputs)
        const text_embeds = outputs.text_embeds || outputs.logits || outputs.pooler_output || outputs.last_hidden_state

        if (!text_embeds) {
          console.error('[haystack-worker] textModel outputs keys:', Object.keys(outputs))
          throw new Error('Text model did not return embeddings')
        }

        const embedData = text_embeds.data as Float32Array
        const dims = text_embeds.dims
        const numEmbeds = dims[0]
        const embedDim = dims[dims.length - 1]

        for (let i = 0; i < numEmbeds; ++i) {
          let sumSq = 0
          for (let j = 0; j < embedDim; ++j) {
            sumSq += embedData[i * embedDim + j] ** 2
          }
          const norm = Math.sqrt(sumSq) || 1e-12
          for (let j = 0; j < embedDim; ++j) {
            embedData[i * embedDim + j] /= norm
          }
        }
        textEmbeddings = text_embeds
      } catch (err) {
        console.error('[haystack-worker] Text embedding error:', err)
      }
      break
    }

    case 'inference': {
      const { imageData, captureSize } = data
      if (!visionModel || !processor || !textEmbeddings) {
        self.postMessage({ type: 'inference-skipped' })
        return
      }

      try {
        const img = new RawImage(new Uint8ClampedArray(imageData), captureSize, captureSize, 4)
        const { pixel_values } = await processor(img)
        const outputs = await visionModel({ pixel_values })
        
        const image_embeds = outputs.image_embeds || outputs.logits || outputs.pooler_output || outputs.last_hidden_state

        if (!image_embeds) {
          console.error('[haystack-worker] visionModel outputs keys:', Object.keys(outputs))
          throw new Error('Vision model did not return embeddings')
        }

        const embedData = image_embeds.data as Float32Array
        const dims = image_embeds.dims
        const embedDim = dims[dims.length - 1]

        // Normalize image embeddings manually
        let sumSq = 0
        for (let j = 0; j < embedDim; ++j) {
          sumSq += embedData[j] ** 2
        }
        const imgNorm = Math.sqrt(sumSq) || 1e-12
        for (let j = 0; j < embedDim; ++j) {
          embedData[j] /= imgNorm
        }

        // Manual dot product for scores
        const txtData = textEmbeddings.data as Float32Array

        const logits = new Float32Array(2)
        for (let i = 0; i < 2; ++i) {
          let sum = 0
          for (let j = 0; j < embedDim; ++j) {
            sum += embedData[j] * txtData[i * embedDim + j]
          }
          logits[i] = sum
        }

        const scale = 100
        const exp0 = Math.exp(logits[0] * scale)
        const exp1 = Math.exp(logits[1] * scale)
        const score = exp0 / (exp0 + exp1)

        self.postMessage({ type: 'score', data: { score } })
      } catch (err) {
        console.error('[haystack-worker] Inference error:', err)
        self.postMessage({ type: 'inference-skipped' })
      }
      break
    }
  }
}
