import { useState, useRef, useEffect } from 'react'
import './App.css'
import {
  VideoClip,
  CaptionStyle,
  getVideoDuration,
  validateFileSize,
  estimateProcessingTime,
  combineVideosWithCaption,
} from './utils/videoProcessing'
import { getFFmpeg, checkBrowserSupport } from './utils/ffmpegLoader'

export default function App() {
  const [clips, setClips] = useState<VideoClip[]>([])
  const [caption, setCaption] = useState<CaptionStyle>({
    text: 'Your caption here',
    fontSize: 24,
    color: '#FFFFFF',
    position: 'bottom',
  })
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<{ step: string; percent: number }>({
    step: '',
    percent: 0,
  })
  const [outputUrl, setOutputUrl] = useState<string | null>(null)
  const [error, setError] = useState<string>('')
  const [browserSupported, setBrowserSupported] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragOverRef = useRef(false)

  useEffect(() => {
    const support = checkBrowserSupport()
    if (!support.supported) {
      setBrowserSupported(false)
      setError(support.message || 'Your browser is not supported')
    }
  }, [])

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return
    setError('')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Validate file type
      if (!file.type.startsWith('video/')) {
        setError(`${file.name} is not a video file`)
        continue
      }

      // Validate file size (100MB max per clip)
      if (!validateFileSize(file, 100)) {
        setError(`${file.name} is too large (max 100MB per clip)`)
        continue
      }

      // Check total size (300MB max total)
      const totalSize = clips.reduce((sum, clip) => sum + clip.file.size, 0) + file.size
      if (totalSize > 300 * 1024 * 1024) {
        setError('Total video size exceeds 300MB limit')
        continue
      }

      // Get video duration
      try {
        const duration = await getVideoDuration(file)
        const newClip: VideoClip = {
          id: `clip-${Date.now()}-${Math.random()}`,
          file,
          name: file.name,
          duration,
        }
        setClips((prev) => [...prev, newClip])
      } catch (err) {
        setError(`Failed to read ${file.name}`)
      }
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveClip = (id: string) => {
    setClips((prev) => prev.filter((clip) => clip.id !== id))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    dragOverRef.current = true
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragOverRef.current = false
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragOverRef.current = false
    handleFileSelect(e.dataTransfer.files)
  }

  const handleProcessVideo = async () => {
    if (clips.length === 0) {
      setError('Please add at least one video clip')
      return
    }

    if (!caption.text.trim()) {
      setError('Please enter caption text')
      return
    }

    setProcessing(true)
    setError('')
    setOutputUrl(null)

    try {
      setProgress({ step: 'Loading FFmpeg...', percent: 5 })
      const ffmpeg = await getFFmpeg()

      setProgress({ step: 'Starting processing...', percent: 10 })
      const blob = await combineVideosWithCaption(ffmpeg, clips, caption, (step, percent) => {
        setProgress({ step, percent })
      })

      const url = URL.createObjectURL(blob)
      setOutputUrl(url)
      setProgress({ step: 'Complete!', percent: 100 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setProgress({ step: '', percent: 0 })
    } finally {
      setProcessing(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0)
  const estimatedTime = estimateProcessingTime(totalDuration)

  return (
    <div className="container">
      <div className="header">
        <h1>🎬 Video Combiner</h1>
        <p>Combine multiple video clips and add captions</p>
      </div>

      {!browserSupported && (
        <div className="card">
          <div className="browser-warning">
            ⚠️ {error}
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button className="error-close" onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Upload Section */}
      <div className="card">
        <h2 className="section-title">📁 Upload Videos</h2>
        <div
          className={`upload-zone ${dragOverRef.current ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <label className="upload-label">
            Click or drag videos here
          </label>
          <div className="upload-hint">
            MP4, MOV, AVI • Max 100MB per clip • Max 300MB total
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*"
            className="file-input"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
      </div>

      {/* Clips List */}
      {clips.length > 0 && (
        <div className="card">
          <h2 className="section-title">📹 Your Clips ({clips.length})</h2>
          <div className="clips-list">
            {clips.map((clip) => (
              <div key={clip.id} className="clip-item">
                <div className="clip-info">
                  <div className="clip-name">{clip.name}</div>
                  <div className="clip-duration">{formatTime(clip.duration)}</div>
                </div>
                <button
                  className="remove-btn"
                  onClick={() => handleRemoveClip(clip.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '15px', color: '#999', fontSize: '0.9em' }}>
            Total duration: {formatTime(totalDuration)}
          </p>
        </div>
      )}

      {/* Caption Section */}
      {clips.length > 0 && (
        <div className="card">
          <h2 className="section-title">✍️ Add Caption</h2>
          <div className="caption-section">
            <div className="form-group">
              <label className="form-label">Caption Text</label>
              <textarea
                className="form-textarea"
                value={caption.text}
                onChange={(e) =>
                  setCaption((prev) => ({ ...prev, text: e.target.value }))
                }
                placeholder="Enter your caption text here"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Font Size</label>
              <input
                type="number"
                className="form-input"
                min="12"
                max="72"
                value={caption.fontSize}
                onChange={(e) =>
                  setCaption((prev) => ({
                    ...prev,
                    fontSize: parseInt(e.target.value),
                  }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Color</label>
              <input
                type="color"
                className="form-input color-input"
                value={caption.color}
                onChange={(e) =>
                  setCaption((prev) => ({ ...prev, color: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Position</label>
              <select
                className="form-select"
                value={caption.position}
                onChange={(e) =>
                  setCaption((prev) => ({
                    ...prev,
                    position: e.target.value as 'top' | 'middle' | 'bottom',
                  }))
                }
              >
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Process Button */}
      {clips.length > 0 && !processing && (
        <div className="card">
          <p style={{ marginBottom: '15px', color: '#666', fontSize: '0.9em' }}>
            ⏱️ Estimated processing time: {formatTime(estimatedTime)}
          </p>
          <button
            className="btn btn-primary"
            onClick={handleProcessVideo}
            disabled={!browserSupported}
          >
            ▶️ Combine & Add Caption
          </button>
        </div>
      )}

      {/* Progress Overlay */}
      {processing && (
        <div className="progress-overlay">
          <div className="progress-modal">
            <div className="progress-title">Processing Video</div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="progress-text">{progress.step}</div>
            <div className="progress-stats">
              <div className="progress-stat">
                <div className="progress-stat-label">Progress</div>
                <div className="progress-stat-value">{progress.percent}%</div>
              </div>
              <div className="progress-stat">
                <div className="progress-stat-label">Est. Time</div>
                <div className="progress-stat-value">{formatTime(estimatedTime)}</div>
              </div>
            </div>
            <p style={{ fontSize: '0.85em', color: '#999', textAlign: 'center' }}>
              ⚠️ Do not close this window
            </p>
          </div>
        </div>
      )}

      {/* Result Section */}
      {outputUrl && (
        <div className="card">
          <div className="result-section">
            <h2 className="result-title">✅ Your Video is Ready!</h2>
            <video
              className="video-preview"
              src={outputUrl}
              controls
            />
            <a
              href={outputUrl}
              download="combined-video.mp4"
              className="btn btn-download"
            >
              ⬇️ Download Video
            </a>
            <button
              className="btn btn-primary"
              onClick={() => {
                setOutputUrl(null)
                setClips([])
                setCaption({
                  text: 'Your caption here',
                  fontSize: 24,
                  color: '#FFFFFF',
                  position: 'bottom',
                })
              }}
              style={{ marginTop: '10px' }}
            >
              ➕ Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
