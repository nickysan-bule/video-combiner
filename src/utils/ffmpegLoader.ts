import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null

export const getFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpegInstance && ffmpegInstance.isLoaded()) {
    return ffmpegInstance
  }

  const ffmpeg = new FFmpeg()
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegInstance = ffmpeg
    return ffmpeg
  } catch (error) {
    throw new Error('Failed to load FFmpeg. Your browser may not support this feature.')
  }
}

export const checkBrowserSupport = (): { supported: boolean; message?: string } => {
  if (typeof WebAssembly === 'undefined') {
    return {
      supported: false,
      message: 'Your browser does not support WebAssembly. Please use Chrome, Firefox, Edge, or Safari.',
    }
  }

  if (typeof SharedArrayBuffer === 'undefined') {
    return {
      supported: false,
      message: 'Your browser does not support SharedArrayBuffer. Please use Chrome, Firefox, or Edge.',
    }
  }

  return { supported: true }
}
