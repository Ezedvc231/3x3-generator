
import Worker from "worker-loader!./waifu2x.worker"
import Waifu2x, { Model } from "./waifu2x"
import { ref } from "vue"
export const upscaling = ref(false)
export const progress = ref(0)
export const progress_msg = ref("Starting...")

let upscaleWorker: Worker | null = null

const has_offscreen_canvas_support = typeof document.createElement("canvas").transferControlToOffscreen === "function"

const updateProgress = (msg: string) => (value: number) => {
  progress.value = value
  progress_msg.value = msg
}

const canvasFromUpscaled = (upscaled: ImageBitmap) : HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = upscaled.width
  canvas.height = upscaled.height

  const ctx = canvas.getContext("bitmaprenderer")
  if (ctx) {
    ctx.transferFromImageBitmap(upscaled)
  } else {
    canvas.getContext("2d")?.drawImage(upscaled, 0, 0)
  }
  upscaling.value = false
  progress.value = 0
  return canvas
}

const upscalefallback = (canvas: HTMLCanvasElement, denoiseModel: Model, upscaleModel: Model) : Promise<HTMLCanvasElement> => {
  return new Promise(async (resolve) => {
    const bitmap = await createImageBitmap(canvas, 0, 0, canvas.width, canvas.height)
    const worker = new Waifu2x()
    worker.progress(denoiseModel, updateProgress("Denoising image..."))
    worker.progress(upscaleModel, updateProgress("Upscaling image..."))
    const denoised = await worker.predict(denoiseModel, bitmap)
    const upscaled = await worker.predict(upscaleModel, denoised)
    resolve(canvasFromUpscaled(upscaled))
  })
}

export const upscale = (canvas: HTMLCanvasElement, denoiseModel: Model, upscaleModel: Model = "scale2.0x_model.json") : Promise<HTMLCanvasElement> => {
  upscaling.value = true

  if (!has_offscreen_canvas_support) {
    return upscalefallback(canvas, denoiseModel, upscaleModel)
  }

  return new Promise(async resolve => {
    if (upscaleWorker === null) {
      upscaleWorker = new Worker()
    }
    upscaleWorker.onmessage = (event: MessageEvent) => {
      if (event.data.type === "progress") {
        updateProgress(event.data.msg)(event.data.value)
        return
      }
      const { upscaled } = event.data
      resolve(canvasFromUpscaled(upscaled))
    }

    upscaleWorker.postMessage({
      bitmap: await createImageBitmap(canvas, 0, 0, canvas.width, canvas.height),
      denoiseModel,
      upscaleModel
    })
  })
}

export default {
  upscaling,
  upscale,
  progress,
  progress_msg
}
