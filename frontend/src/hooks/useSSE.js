import { useState, useCallback, useRef } from 'react'

export function useSSE() {
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef(null)

  const startStream = useCallback(async (url, body, onToken, onDone, onError) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || 'Request failed')
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

          // Object payloads are citations / control messages
          if (payload.startsWith('{')) {
            try {
              const parsed = JSON.parse(payload)
              if (parsed.citations) onDone && onDone(parsed.citations)
            } catch {}
            continue
          }

          // All tokens are JSON-encoded strings — decode them
          try {
            const token = JSON.parse(payload)
            if (typeof token === 'string') onToken && onToken(token)
          } catch {
            // Fallback: treat as raw string (backwards compat)
            onToken && onToken(payload)
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError && onError(err.message)
    } finally {
      setStreaming(false)
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  return { streaming, startStream, abort }
}
