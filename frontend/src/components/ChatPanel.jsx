import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSSE } from '../hooks/useSSE'

const mdComponents = {
  h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold text-white mt-2 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-200 mt-2 mb-0.5">{children}</h3>,
  p: ({ children }) => <p className="text-slate-200 leading-relaxed mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 text-slate-200">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 text-slate-200">{children}</ol>,
  li: ({ children }) => <li className="text-slate-200 leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-slate-300 italic">{children}</em>,
  pre: ({ children }) => (
    <pre className="bg-slate-900 rounded-lg p-3 overflow-x-auto my-2 border border-slate-700">{children}</pre>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className="text-xs font-mono text-slate-200 whitespace-pre">{children}</code>
    ) : (
      <code className="bg-slate-700 text-blue-300 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
    ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-blue-500 pl-3 text-slate-300 italic my-2">{children}</blockquote>
  ),
  hr: () => <hr className="border-slate-700 my-3" />,
  a: ({ href, children }) => (
    <a href={href} className="text-blue-400 underline hover:text-blue-300" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs text-slate-200 border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-slate-600 px-3 py-1.5 bg-slate-700/60 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-slate-700 px-3 py-1.5">{children}</td>,
}

function UserMessage({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  )
}

function AssistantMessage({ content, citations }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[84%] bg-slate-800 border border-slate-700 border-l-2 border-l-blue-500 rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {content}
        </ReactMarkdown>
        {citations?.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-700 flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-500 self-center mr-0.5">Sources</span>
            {citations.map((c, i) => {
              const short = c.filename
                ? c.filename.replace(/\.pdf$/i, '').slice(0, 22)
                : null
              return (
                <span
                  key={i}
                  className="text-xs bg-blue-950 text-blue-300 border border-blue-800/60 rounded-md px-2 py-0.5 cursor-default"
                  title={c.text}
                >
                  {short ? `${short} · p.${c.page}` : `p.${c.page}`}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Message({ msg }) {
  if (msg.role === 'user') return <UserMessage content={msg.content} />
  return <AssistantMessage content={msg.content} citations={msg.citations} />
}

export default function ChatPanel({ docs, history, setHistory }) {
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState('')
  const [suggestedQs, setSuggestedQs] = useState([])
  const [qsLoading, setQsLoading] = useState(false)
  const suggestCacheRef = useRef({})
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const { streaming, startStream, abort } = useSSE()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamingText])

  useEffect(() => {
    if (!docs || docs.length === 0) { setSuggestedQs([]); return }
    const key = docs.map((d) => d.doc_id).sort().join(',')
    if (suggestCacheRef.current[key]) {
      setSuggestedQs(suggestCacheRef.current[key])
      return
    }
    setQsLoading(true)
    fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docs: docs.map((d) => ({ doc_id: d.doc_id, filename: d.displayName || d.filename })) }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const qs = data.questions || []
        suggestCacheRef.current[key] = qs
        setSuggestedQs(qs)
      })
      .catch(() => setSuggestedQs([]))
      .finally(() => setQsLoading(false))
  }, [docs])

  const send = async () => {
    const question = input.trim()
    if (!question || streaming) return
    setInput('')
    setError('')
    setStreamingText('')

    const newHistory = [...history, { role: 'user', content: question }]
    setHistory(newHistory)

    let accumulated = ''

    await startStream(
      '/api/chat',
      { docs: docs.map((d) => ({ doc_id: d.doc_id, filename: d.displayName || d.filename })), question, history },
      (token) => {
        accumulated += token
        setStreamingText(accumulated)
      },
      (citations) => {
        setHistory((prev) => [
          ...prev,
          { role: 'assistant', content: accumulated, citations: citations || [] },
        ])
        setStreamingText('')
      },
      (err) => {
        setError(err)
        setStreamingText('')
      }
    )
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const pickSuggestion = (q) => {
    setInput(q)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full gap-0">

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">

        {history.length === 0 && !streaming && (
          <div className="flex flex-col items-center gap-5 mt-10 px-4">
            <p className="text-slate-500 text-sm">
              {qsLoading ? 'Generating suggestions…' : 'Ask a question about your document'}
            </p>

            {/* Suggested questions — horizontal scroll row */}
            {!qsLoading && suggestedQs.length > 0 && (
              <div className="w-full overflow-x-auto pb-1">
                <div className="flex gap-2 w-max mx-auto">
                  {suggestedQs.map((q) => (
                    <button
                      key={q}
                      onClick={() => pickSuggestion(q)}
                      className="shrink-0 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-slate-100 rounded-xl px-3 py-2 transition-all max-w-[220px] text-left leading-snug"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {qsLoading && (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 w-32 rounded-xl bg-slate-800 animate-pulse" />
                ))}
              </div>
            )}
          </div>
        )}

        {history.map((msg, i) => <Message key={i} msg={msg} />)}

        {/* Streaming assistant response */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[84%] bg-slate-800 border border-slate-700 border-l-2 border-l-blue-500 rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {streamingText}
              </ReactMarkdown>
              <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-middle rounded-sm" />
            </div>
          </div>
        )}

        {/* Thinking indicator */}
        {streaming && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs text-center py-1">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-slate-800 pt-4 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          className="flex-1 bg-slate-800 border border-slate-700 focus:border-blue-500 text-slate-100 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-colors placeholder-slate-500"
          rows={2}
          placeholder="Ask about parties, clauses, obligations… (Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={streaming}
        />
        {streaming ? (
          <button
            onClick={abort}
            className="px-4 py-3 bg-red-700 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!input.trim()}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shrink-0"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
