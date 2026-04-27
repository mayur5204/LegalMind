import { useState, useEffect, useCallback } from 'react'
import PDFUploader from '../components/PDFUploader'
import ChatPanel from '../components/ChatPanel'

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

const CATEGORY_BORDER = {
  'Non-Disclosure Agreement':         'border-blue-500',
  'Employment Contract':              'border-emerald-500',
  'Lease Agreement':                  'border-orange-500',
  'Service Agreement':                'border-violet-500',
  'Purchase Agreement':               'border-yellow-500',
  'Loan Agreement':                   'border-red-500',
  'Partnership Agreement':            'border-cyan-500',
  'Settlement Agreement':             'border-pink-500',
  'Consulting Agreement':             'border-violet-400',
  'Licensing Agreement':              'border-indigo-500',
  'Terms of Service':                 'border-slate-500',
  'Privacy Policy':                   'border-slate-500',
  'Power of Attorney':                'border-indigo-400',
  'Will and Testament':               'border-slate-400',
  'Shareholders Agreement':           'border-cyan-400',
  'Independent Contractor Agreement': 'border-violet-400',
}

const CATEGORY_TEXT = {
  'Non-Disclosure Agreement':         'text-blue-400',
  'Employment Contract':              'text-emerald-400',
  'Lease Agreement':                  'text-orange-400',
  'Service Agreement':                'text-violet-400',
  'Purchase Agreement':               'text-yellow-400',
  'Loan Agreement':                   'text-red-400',
  'Partnership Agreement':            'text-cyan-400',
  'Settlement Agreement':             'text-pink-400',
  'Consulting Agreement':             'text-violet-300',
  'Licensing Agreement':              'text-indigo-400',
  'Terms of Service':                 'text-slate-400',
  'Privacy Policy':                   'text-slate-400',
  'Power of Attorney':                'text-indigo-300',
  'Will and Testament':               'text-slate-400',
  'Shareholders Agreement':           'text-cyan-300',
  'Independent Contractor Agreement': 'text-violet-300',
}

function catBorder(cat) { return CATEGORY_BORDER[cat] || 'border-slate-600' }
function catText(cat) { return CATEGORY_TEXT[cat] || 'text-slate-400' }

export default function Home() {
  const [docs, setDocs] = useState(() => load('dm_docs', []))
  const [activeDocId, setActiveDocId] = useState(() => load('dm_active', null))
  const [selectedDocIds, setSelectedDocIds] = useState(() => load('dm_selected', []))
  const [histories, setHistories] = useState(() => load('dm_histories', {}))

  useEffect(() => { localStorage.setItem('dm_docs', JSON.stringify(docs)) }, [docs])
  useEffect(() => { localStorage.setItem('dm_active', JSON.stringify(activeDocId)) }, [activeDocId])
  useEffect(() => { localStorage.setItem('dm_selected', JSON.stringify(selectedDocIds)) }, [selectedDocIds])
  useEffect(() => { localStorage.setItem('dm_histories', JSON.stringify(histories)) }, [histories])

  const updateDoc = useCallback((docId, patch) => {
    setDocs((prev) => prev.map((d) => d.doc_id === docId ? { ...d, ...patch } : d))
  }, [])

  const classifyDoc = useCallback(async (docId) => {
    updateDoc(docId, { classifying: true })
    try {
      const resp = await fetch(`/api/classify/${docId}`, { method: 'POST' })
      if (!resp.ok) return
      const data = await resp.json()
      updateDoc(docId, {
        category: data.category,
        parties: data.parties,
        date: data.date,
        suggestedName: data.suggested_name,
      })
    } catch {
      // silent
    } finally {
      updateDoc(docId, { classifying: false })
    }
  }, [updateDoc])

  // Re-classify any docs restored from localStorage that are missing classification
  useEffect(() => {
    docs.forEach((doc) => {
      if (!doc.category && !doc.classifying) classifyDoc(doc.doc_id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onDocReady = (doc) => {
    const newDoc = { ...doc, displayName: doc.filename, classifying: false }
    setDocs((prev) => {
      if (prev.find((d) => d.doc_id === doc.doc_id)) return prev
      return [...prev, newDoc]
    })
    setActiveDocId(doc.doc_id)
    setSelectedDocIds((prev) => prev.includes(doc.doc_id) ? prev : [...prev, doc.doc_id])
    classifyDoc(doc.doc_id)
  }

  const removeDoc = (docId) => {
    setDocs((prev) => prev.filter((d) => d.doc_id !== docId))
    setHistories((prev) => { const n = { ...prev }; delete n[docId]; return n })
    setSelectedDocIds((prev) => prev.filter((id) => id !== docId))
    if (activeDocId === docId) {
      const remaining = docs.filter((d) => d.doc_id !== docId)
      const next = remaining.length > 0 ? remaining[remaining.length - 1].doc_id : null
      setActiveDocId(next)
      if (next) setSelectedDocIds((prev) => prev.includes(next) ? prev : [...prev, next])
    }
  }

  const toggleSelect = (docId) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }

  const acceptRename = (docId, suggestedName) => {
    updateDoc(docId, { displayName: suggestedName, suggestedName: null })
  }

  const dismissRename = (docId) => {
    updateDoc(docId, { suggestedName: null })
  }

  const activeDoc = docs.find((d) => d.doc_id === activeDocId)
  const selectedDocs = docs.filter((d) => selectedDocIds.includes(d.doc_id))
  const historyKey = selectedDocIds.slice().sort().join(',') || activeDocId || ''

  const setHistory = (key) => (updater) => {
    setHistories((prev) => ({
      ...prev,
      [key]: typeof updater === 'function' ? updater(prev[key] || []) : updater,
    }))
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">⚖️</span>
          <span className="text-base font-semibold text-white tracking-tight">LegalMind</span>
        </div>

        {/* Active doc info — center */}
        {activeDoc && (
          <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
            <span className="text-sm text-slate-300 truncate max-w-[240px]">
              {activeDoc.displayName || activeDoc.filename}
            </span>
            {activeDoc.category && (
              <span className={`text-xs shrink-0 ${catText(activeDoc.category)}`}>
                {activeDoc.category}
              </span>
            )}
            {selectedDocs.length > 1 && (
              <span className="text-xs text-slate-500 shrink-0">
                +{selectedDocs.length - 1} more
              </span>
            )}
          </div>
        )}

        <span className="ml-auto text-xs text-slate-600 shrink-0">
          gemma4:31b · nomic-embed
        </span>
      </header>

      {/* ── Document info bar (parties + date) ── */}
      {activeDoc?.parties && activeDoc.parties !== 'Unknown' && (
        <div className="shrink-0 border-b border-slate-800/60 bg-slate-900/40 px-6 py-1.5 flex items-center gap-2 text-xs text-slate-500">
          <span>{activeDoc.parties}</span>
          {activeDoc.date && activeDoc.date !== 'Unknown' && (
            <><span>·</span><span>{activeDoc.date}</span></>
          )}
          <span>·</span>
          <span>{activeDoc.page_count} pages · {activeDoc.chunk_count} chunks</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-72 shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col overflow-hidden">

          {/* Upload zone */}
          <div className="p-4 border-b border-slate-800">
            <PDFUploader onDocReady={onDocReady} />
          </div>

          {/* Document library */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {docs.length > 0 && (
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-widest">
                  Library
                </span>
                <span className="text-xs text-slate-600">
                  {docs.length} {docs.length === 1 ? 'doc' : 'docs'}
                  {docs.length > 1 && ` · ${selectedDocIds.length} selected`}
                </span>
              </div>
            )}

            {docs.length === 0 && (
              <p className="text-xs text-slate-600 text-center mt-4">No documents yet</p>
            )}

            {docs.map((doc) => {
              const name = doc.displayName || doc.filename
              const isActive = doc.doc_id === activeDocId
              const isSelected = selectedDocIds.includes(doc.doc_id)
              const hasSuggestion = doc.suggestedName && doc.suggestedName !== name

              return (
                <div key={doc.doc_id} className="flex flex-col gap-1">
                  <div className="flex items-start gap-2 group relative">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(doc.doc_id)}
                      className="mt-2.5 ml-0.5 shrink-0 accent-blue-500 cursor-pointer"
                      title="Include in analysis"
                    />
                    <button
                      onClick={() => setActiveDocId(doc.doc_id)}
                      className={`flex-1 min-w-0 text-left rounded-lg border-l-2 pl-3 pr-6 py-2 transition-colors ${catBorder(doc.category)} ${
                        isActive ? 'bg-slate-800' : 'bg-slate-900 hover:bg-slate-800/70'
                      }`}
                      title={name}
                    >
                      <span className="block text-sm font-medium text-slate-100 truncate">{name}</span>
                      {doc.classifying && (
                        <span className="block text-xs text-slate-500 mt-0.5 animate-pulse">Classifying…</span>
                      )}
                      {doc.category && !doc.classifying && (
                        <span className={`block text-xs mt-0.5 ${catText(doc.category)}`}>{doc.category}</span>
                      )}
                      {doc.parties && doc.parties !== 'Unknown' && !doc.classifying && (
                        <span className="block text-xs text-slate-500 truncate mt-0.5">
                          {doc.parties}{doc.date && doc.date !== 'Unknown' ? ` · ${doc.date}` : ''}
                        </span>
                      )}
                      <span className="block text-xs text-slate-600 mt-0.5">
                        {doc.page_count}p · {doc.chunk_count} chunks
                      </span>
                    </button>
                    <button
                      onClick={() => removeDoc(doc.doc_id)}
                      className="absolute right-1.5 top-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs p-0.5"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Rename suggestion */}
                  {hasSuggestion && (
                    <div className="ml-7 flex items-center gap-1 bg-slate-800/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs text-slate-500 shrink-0">Rename to</span>
                      <span className="text-xs text-slate-300 truncate flex-1 mx-1" title={doc.suggestedName}>
                        {doc.suggestedName}
                      </span>
                      <button
                        onClick={() => acceptRename(doc.doc_id, doc.suggestedName)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium shrink-0 px-1"
                        title="Accept"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => dismissRename(doc.doc_id)}
                        className="text-xs text-slate-600 hover:text-slate-400 shrink-0 px-1"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {selectedDocs.length > 1 && (
              <p className="text-xs text-blue-400 px-1 pt-1">
                Analysing across {selectedDocs.length} documents
              </p>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {!activeDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl">
                ⚖️
              </div>
              <div>
                <p className="text-slate-300 font-medium">Upload a legal document to begin</p>
                <p className="text-slate-600 text-sm mt-1">
                  Contracts · NDAs · Agreements · Policies
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden p-5">
              <ChatPanel
                docs={selectedDocs.length > 0 ? selectedDocs : [activeDoc]}
                history={histories[historyKey] || []}
                setHistory={setHistory(historyKey)}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
