import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

export interface VideoClip {
  id: string
  file: File
  name: string
  duration: number
}

export interface CaptionStyle {
  text: string
  fontSize: number
  color: string
  position: 'top' | 'middle' | 'bottom'
}

export const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = URL.createObjectURL(file)
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    video.onerror = (err) => reject(err)
  })
}

export const validateFileSize = (file: File, maxSizeMB: number): boolean => {
  const maxBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxBytes
}

export const estimateProcessingTime = (totalDurationSeconds: number): number => {
  // Rough estimate: 1 second of video takes ~1-2 seconds to process
  return Math.ceil(totalDurationSeconds * 1.5)
}

const buildConcatDemuxer = (clips: VideoClip[]): string => {
  let concat = ''
  clips.forEach((clip, index) => {
    concat += `file 'input_${index}.mp4'\n`
  })
  return concat
}

const buildSubtitleFilter = (style: CaptionStyle, videoDuration: number): string => {
  const colorRGB = hexToRGB(style.color)
  const yOffset = getYOffset(style.position)
  
  // Create SRT subtitle data
  const srtContent = `1
00:00:00,000 --> 00:${String(Math.floor(videoDuration / 60)).padStart(2, '0')}:${String(Math.floor(videoDuration % 60)).padStart(2, '0')},000
${style.text}`
  
  return srtContent
}

const hexToRGB = (hex: string): string => {
  const r = hex.slice(1, 3)
  const g = hex.slice(3, 5)
  const b = hex.slice(5, 7)
  return `0x${b}${g}${r}`
}

const getYOffset = (position: 'top' | 'middle' | 'bottom'): number => {
  switch (position) {
    case 'top':
      return 50
    case 'middle':
      return 'h/2 - text_h/2'
    case 'bottom':
      return 'h - text_h - 50'
    default:
      return 'h - text_h - 50'
  }
}

export const combineVideosWithCaption = async (
  ffmpeg: FFmpeg,
  clips: VideoClip[],
  caption: CaptionStyle,
  onProgress: (step: string, progress: number) => void
): Promise<Blob> => {
  try {
    // Step 1: Load all video files
    onProgress('Loading videos...', 10)
    for (let i = 0; i < clips.length; i++) {
      const data = await fetchFile(clips[i].file)
      await ffmpeg.writeFile(`input_${i}.mp4`, data)
      onProgress(`Loading videos... (${i + 1}/${clips.length})`, 10 + (i / clips.length) * 20)
    }

    // Step 2: Create concat demuxer file
    onProgress('Preparing video concatenation...', 35)
    const concatContent = buildConcatDemuxer(clips)
    await ffmpeg.writeFile('concat.txt', concatContent)

    // Step 3: Concatenate videos
    onProgress('Combining videos...', 40)
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      'combined.mp4',
    ])

    // Step 4: Create subtitle file
    onProgress('Adding captions...', 60)
    const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0)
    const subtitleContent = buildSubtitleFilter(caption, totalDuration)
    await ffmpeg.writeFile('subtitles.srt', subtitleContent)

    // Step 5: Add captions and encode
    onProgress('Encoding with captions...', 70)
    await ffmpeg.exec([
      '-i', 'combined.mp4',
      '-vf', `subtitles=subtitles.srt:force_style='FontSize=${caption.fontSize},PrimaryColour=${hexToRGB(caption.color)}'`,
      '-c:a', 'aac',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      'output.mp4',
    ])

    // Step 6: Read output file
    onProgress('Finalizing...', 90)
    const data = await ffmpeg.readFile('output.mp4')
    
    let videoBuffer: ArrayBuffer
    if (data instanceof ArrayBuffer) {
      videoBuffer = data
    } else if (data instanceof Uint8Array) {
      videoBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    } else {
      throw new Error('Unexpected data format from FFmpeg')
    }

    onProgress('Complete!', 100)
    return new Blob([videoBuffer], { type: 'video/mp4' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Video processing failed: ${message}`)
  }
}
