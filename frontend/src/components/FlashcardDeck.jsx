import { useState, useEffect } from 'react'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function FlashcardDeck({ docId }) {
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [topicFilter, setTopicFilter] = useState('All')
  const [count, setCount] = useState(10)
  const [generated, setGenerated] = useState(false)

  // ── Restore persisted cards on mount ──────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`dm_flashcards_${docId}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCards(parsed)
          setGenerated(true)
          setIndex(0)
          setTopicFilter('All')
        }
      } catch {}
    } else {
      setCards([])
      setGenerated(false)
    }
  }, [docId])

  const generate = async () => {
    setLoading(true)
    setError('')
    setFlipped(false)
    setIndex(0)

    try {
      const resp = await fetch(`/api/flashcards/${docId}?count=${count}`, { method: 'POST' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail || 'Failed to generate flashcards')
      }
      const data = await resp.json()
      const newCards = data.cards || []
      setCards(newCards)
      setTopicFilter('All')
      setGenerated(true)
      localStorage.setItem(`dm_flashcards_${docId}`, JSON.stringify(newCards))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const clearAndRegenerate = () => {
    localStorage.removeItem(`dm_flashcards_${docId}`)
    setGenerated(false)
    setCards([])
    setIndex(0)
    setFlipped(false)
  }

  const topics = ['All', ...new Set(cards.map((c) => c.topic))]
  const filtered = topicFilter === 'All' ? cards : cards.filter((c) => c.topic === topicFilter)
  const card = filtered[index]

  const prev = () => { setFlipped(false); setIndex((i) => Math.max(0, i - 1)) }
  const next = () => { setFlipped(false); setIndex((i) => Math.min(filtered.length - 1, i + 1)) }
  const doShuffle = () => { setCards(shuffle(cards)); setIndex(0); setFlipped(false) }

  if (!generated) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <p className="text-gray-400 text-sm">Generate flashcards from your document</p>
        <div className="flex items-center gap-3">
          <label className="text-gray-400 text-sm">Cards:</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-gray-800 text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={generate}
          disabled={loading}
          className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
        >
          {loading ? 'Generating…' : 'Generate Flashcards'}
        </button>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="text-center text-gray-400 mt-12">
        No cards for this topic.
        <button onClick={() => setTopicFilter('All')} className="ml-2 text-violet-400 underline">Show all</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs">Topic:</label>
          <select
            value={topicFilter}
            onChange={(e) => { setTopicFilter(e.target.value); setIndex(0); setFlipped(false) }}
            className="bg-gray-800 text-gray-100 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {topics.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={doShuffle} className="text-xs text-gray-400 hover:text-white transition-colors">Shuffle</button>
          <button onClick={clearAndRegenerate} className="text-xs text-gray-400 hover:text-white transition-colors">
            Regenerate
          </button>
          <span className="text-gray-500 text-xs">{index + 1} / {filtered.length}</span>
        </div>
      </div>

      <div
        className="flex-1 cursor-pointer"
        style={{ perspective: '1200px' }}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className="relative w-full h-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '300px',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-gray-800 rounded-2xl flex flex-col items-center justify-center p-8 text-center"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="text-xs text-violet-400 mb-4 uppercase tracking-widest">{card.topic}</span>
            <p className="text-gray-100 text-xl font-medium leading-relaxed">{card.front}</p>
            <span className="text-gray-500 text-xs mt-6">Click to reveal answer</span>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 bg-violet-900/40 border border-violet-700/50 rounded-2xl flex flex-col items-center justify-center p-8 text-center"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-xs text-violet-400 mb-4 uppercase tracking-widest">Answer</span>
            <p className="text-gray-100 text-lg leading-relaxed">{card.back}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <button
          onClick={prev}
          disabled={index === 0}
          className="px-5 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-100 rounded-xl text-sm transition-colors"
        >
          ← Prev
        </button>
        <button
          onClick={next}
          disabled={index === filtered.length - 1}
          className="px-5 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-100 rounded-xl text-sm transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
