import { useState, useRef } from 'react'

const STEPS = ['saving', 'extracting', 'chunking', 'embedding', 'done']
const STEP_LABELS = { saving: 'Saving', extracting: 'Extracting text', chunking: 'Chunking', embedding: 'Embedding', done: 'Ready' }
const BASE_PROGRESS = { saving: 10, extracting: 30, chunking: 55, embedding: 75, done: 100 }

function progressPct(step, embedProgress) {
  if (!step) return 0
  if (step === 'embedding' && embedProgress) {
    const ratio = embedProgress.done / Math.max(embedProgress.total, 1)
    return 75 + ratio * 22   // 75 → 97 %
  }
  return BASE_PROGRESS[step] ?? 0
}

export default function PDFUploader({ onDocReady }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState(null)
  const [embedProgress, setEmbedProgress] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const upload = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.')
      return
    }
    setError('')
    setUploading(true)
    setCurrentStep('saving')
    setEmbedProgress(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const resp = await fetch('/api/ingest', { method: 'POST', body: formData })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || 'Upload failed')
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          let event
          try { event = JSON.parse(payload) } catch { continue }

          if (event.step === 'error') {
            setError(event.message)
            setUploading(false)
            setCurrentStep(null)
            return
          }

          setCurrentStep(event.step)
          if (event.step === 'embedding') {
            setEmbedProgress({ done: event.progress, total: event.total })
          }
          if (event.step === 'done') {
            onDocReady({
              doc_id: event.doc_id,
              filename: event.filename,
              page_count: event.page_count,
              chunk_count: event.chunk_count,
              status: event.status,
            })
            setTimeout(() => {
              setUploading(false)
              setCurrentStep(null)
              setEmbedProgress(null)
            }, 600)
          }
        }
      }
    } catch (err) {
      setError(err.message)
      setUploading(false)
      setCurrentStep(null)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    upload(e.dataTransfer.files[0])
  }

  const pct = progressPct(currentStep, embedProgress)

  return (
    <div className="w-full flex flex-col gap-2">
      <div
        className={`border border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all ${
          uploading
            ? 'border-blue-700/50 bg-blue-950/20 cursor-default'
            : dragging
            ? 'border-blue-500 bg-blue-950/30'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/40 hover:bg-slate-800/60'
        }`}
        onDragOver={(e) => { if (!uploading) { e.preventDefault(); setDragging(true) } }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => { if (!uploading) inputRef.current?.click() }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => upload(e.target.files[0])}
        />
        <p className="text-slate-400 text-xs font-medium">
          {uploading
            ? (STEP_LABELS[currentStep] || 'Processing…')
            : 'Drop a PDF or click to upload'}
        </p>
        {!uploading && (
          <p className="text-slate-600 text-xs mt-0.5">Legal documents only</p>
        )}
      </div>

      {/* Progress bar */}
      {uploading && currentStep && (
        <div className="flex flex-col gap-1">
          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {currentStep === 'embedding' && embedProgress && (
            <p className="text-xs text-slate-500 text-right">
              {embedProgress.done}/{embedProgress.total} batches
            </p>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
