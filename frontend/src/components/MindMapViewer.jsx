import { useEffect, useRef, useState, useCallback } from 'react'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'

const transformer = new Transformer()

const MM_OPTIONS = {
  color: ['#a78bfa', '#60a5fa', '#34d399', '#f472b6', '#fb923c', '#facc15'],
  duration: 300,
}

function renderMarkmap(svgEl, markdownStr, existingMm) {
  const { root } = transformer.transform(markdownStr)
  if (existingMm) {
    existingMm.setData(root)
    return existingMm
  }
  return Markmap.create(svgEl, MM_OPTIONS, root)
}

export default function MindMapViewer({ docId, visible }) {
  const svgRef = useRef(null)
  const mmRef = useRef(null)
  const markdownRef = useRef('')
  const renderTimerRef = useRef(null)

  const [phase, setPhase] = useState('idle') // idle | loading | done | error
  const [error, setError] = useState('')

  // ── Restore from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`dm_mindmap_${docId}`)
    if (saved) {
      markdownRef.current = saved
      setPhase('done')
    } else {
      setPhase('idle')
    }
    return () => {
      mmRef.current = null
      markdownRef.current = ''
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    }
  }, [docId])

  // ── Draw markmap once SVG is in DOM and we have content ─────────────────
  useEffect(() => {
    if (phase === 'done' && svgRef.current && markdownRef.current && !mmRef.current) {
      // Small defer lets the SVG element finish painting before markmap measures it
      const t = setTimeout(() => {
        try {
          mmRef.current = renderMarkmap(svgRef.current, markdownRef.current, null)
          mmRef.current.fit()
        } catch (err) {
          console.error('Markmap render error:', err)
        }
      }, 100)
      return () => clearTimeout(t)
    }
  }, [phase])

  // ── Re-fit when tab becomes visible ─────────────────────────────────────
  useEffect(() => {
    if (visible && mmRef.current) {
      setTimeout(() => mmRef.current?.fit(), 50)
    }
  }, [visible])

  // ── Debounced render during streaming ────────────────────────────────────
  const scheduleRender = useCallback(() => {
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
    renderTimerRef.current = setTimeout(() => {
      if (!svgRef.current || !markdownRef.current) return
      try {
        mmRef.current = renderMarkmap(svgRef.current, markdownRef.current, mmRef.current)
      } catch (err) {
        console.error('Markmap streaming render error:', err)
      }
    }, 300)
  }, [])

  // ── Generate ─────────────────────────────────────────────────────────────
  const generate = async () => {
    setError('')
    setPhase('loading')
    markdownRef.current = ''
    mmRef.current = null

    try {
      const resp = await fetch(`/api/mindmap/${docId}`, { method: 'POST' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || 'Failed to generate mind map')
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
          if (!payload || payload === '[DONE]') continue
          try {
            const token = JSON.parse(payload)
            if (typeof token === 'string') {
              markdownRef.current += token
              scheduleRender()
            }
          } catch {
            markdownRef.current += payload
            scheduleRender()
          }
        }
      }

      // Stream complete — flush any pending debounced render
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current)
      if (!markdownRef.current.trim()) {
        throw new Error('Model returned no content')
      }

      // Make sure the final markdown is rendered (in case last batch was debounced away)
      try {
        if (svgRef.current) {
          mmRef.current = renderMarkmap(svgRef.current, markdownRef.current, mmRef.current)
          mmRef.current.fit()
        }
      } catch (err) {
        console.error('Markmap final render error:', err)
      }

      localStorage.setItem(`dm_mindmap_${docId}`, markdownRef.current)
      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }

  const showSvg = phase === 'loading' || phase === 'done'

  return (
    <div className="flex flex-col h-full gap-3">

      {/* ── Idle: generate button ── */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <p className="text-gray-400 text-sm">Generate a visual mind map of your document</p>
          <button
            onClick={generate}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-colors"
          >
            Generate Mind Map
          </button>
        </div>
      )}

      {/* ── Loading indicator (above SVG) ── */}
      {phase === 'loading' && (
        <p className="text-center text-gray-400 text-sm animate-pulse shrink-0">
          Generating mind map — building as tokens arrive…
        </p>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={generate} className="text-violet-400 underline text-sm">Retry</button>
        </div>
      )}

      {/*
        SVG is ALWAYS mounted once generation starts (phase = loading or done).
        Keeping it in the DOM preserves the markmap instance reference.
      */}
      {showSvg && (
        <div className="flex-1 rounded-xl overflow-hidden" style={{ minHeight: 420, background: '#111827' }}>
          <svg
            ref={svgRef}
            style={{ width: '100%', height: '100%', minHeight: 420, background: '#111827' }}
          />
        </div>
      )}

      {/* ── Footer controls ── */}
      {phase === 'done' && (
        <div className="flex justify-between items-center shrink-0">
          <p className="text-gray-500 text-xs">Scroll to zoom · Drag to pan · Click nodes to collapse</p>
          <div className="flex gap-4">
            <button
              onClick={() => { localStorage.removeItem(`dm_mindmap_${docId}`); setPhase('idle'); mmRef.current = null; markdownRef.current = '' }}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Regenerate
            </button>
            <button
              onClick={() => mmRef.current?.fit()}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              Fit to view
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
