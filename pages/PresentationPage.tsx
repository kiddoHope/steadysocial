import React, { useEffect, useMemo, useState } from 'react'
import SlideDeck, { TransitionType } from '../components/presentation/SlideDeck'
import {
  createPresentation,
  deletePresentation,
  getPresentations,
  PresentationData,
  updatePresentation,
} from '../services/presentationService'

const renderSlideNode = (slide: { title?: string; content: string; bgColor?: string; customMarkup?: string }) => {
  if (slide.customMarkup) {
    return (
      <div className="w-full h-full overflow-hidden" dangerouslySetInnerHTML={{ __html: slide.customMarkup }} />
    )
  }

  const rawLines = slide.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const bulletLines = rawLines.map((line) => line.replace(/^([0-9]+\.|[-*•])\s+/, ''))
  const firstLine = bulletLines[0] || ''
  const slideStyle: React.CSSProperties = {}
  const wrapClassName = ['w-full h-full flex flex-col justify-between p-10', slide.bgColor && !/^#|rgb|hsl/.test(slide.bgColor) ? slide.bgColor : 'bg-slate-950 text-white'].filter(Boolean).join(' ')
  if (slide.bgColor && /^#|rgb|hsl/.test(slide.bgColor)) {
    slideStyle.background = slide.bgColor
  }

  return (
    <div className={wrapClassName} style={slideStyle}>
      <div className="relative z-10 h-full flex flex-col justify-between gap-8">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.35em] opacity-80">
            <span className="text-lg">✨</span>
            <span>Slide</span>
          </div>
          {slide.title && <h2 className="text-5xl md:text-6xl font-black tracking-tight max-w-3xl">{slide.title}</h2>}
          <p className="max-w-3xl text-lg leading-8 opacity-90">{firstLine}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[1.5rem] bg-white/10 p-8 ring-1 ring-white/10 backdrop-blur shadow-lg">
            <div className="text-sm uppercase tracking-[0.35em] opacity-80 mb-4">Key points</div>
            <ul className="list-disc list-inside space-y-3 text-base leading-7">
              {bulletLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="rounded-[1.5rem] bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur flex gap-4 items-start">
              <div className="text-3xl leading-none">💡</div>
              <div>
                <div className="text-xs uppercase tracking-[0.35em] opacity-80">Insight</div>
                <p className="mt-3 text-sm leading-6 opacity-85">{bulletLines[1] || firstLine}</p>
              </div>
            </div>
            <div className="rounded-[1.5rem] bg-white/10 p-6 ring-1 ring-white/10 backdrop-blur flex gap-4 items-start">
              <div className="text-3xl leading-none">🚀</div>
              <div>
                <div className="text-xs uppercase tracking-[0.35em] opacity-80">Action</div>
                <p className="mt-3 text-sm leading-6 opacity-85">{bulletLines[2] || firstLine}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PresentationPage() {
  const [presentations, setPresentations] = useState<PresentationData[]>([])
  const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null)
  const [transitionType, setTransitionType] = useState<TransitionType>('slide-horizontal')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('My AI Presentation')
  const [formMarkup, setFormMarkup] = useState(`<div class="w-full h-full flex items-center justify-center p-10 bg-slate-950 text-white"><div class="max-w-3xl text-center"><h2 class="text-5xl font-black mb-4">Your slide headline here</h2><p class="text-lg leading-8 opacity-90">Paste your full HTML slide markup here and it will render as a custom presentation.</p></div></div>`)
  const [formTransition, setFormTransition] = useState<TransitionType>('slide-horizontal')
  const [saving, setSaving] = useState(false)
  const [selectedTitle, setSelectedTitle] = useState('')
  const [selectedTransition, setSelectedTransition] = useState<TransitionType>('slide-horizontal')
  const [selectedSaving, setSelectedSaving] = useState(false)

  useEffect(() => {
    async function loadPresentations() {
      try {
        const data = await getPresentations()
        setPresentations(data)
        if (data.length > 0) {
          setSelectedPresentationId(data[0].id)
          setTransitionType(data[0].transition || 'slide-horizontal')
        }
      } catch (err: any) {
        setError(err.message || 'Unable to load presentations')
      } finally {
        setLoading(false)
      }
    }

    loadPresentations()
  }, [])

  const selectedPresentation = useMemo(
    () => presentations.find((presentation) => presentation.id === selectedPresentationId) || presentations[0] || null,
    [presentations, selectedPresentationId]
  )

  const slideNodes = selectedPresentation
    ? selectedPresentation.slides.map((slide) => ({ id: slide.id, node: renderSlideNode(slide) }))
    : []

  const customPresentationSlide = selectedPresentation?.customMarkup
    ? [{ id: 'custom', node: <div className="w-full h-full overflow-hidden" dangerouslySetInnerHTML={{ __html: selectedPresentation.customMarkup }} /> }]
    : null

  useEffect(() => {
    if (selectedPresentation) {
      setTransitionType(selectedPresentation.transition || 'slide-horizontal')
      setSelectedTitle(selectedPresentation.title)
      setSelectedTransition(selectedPresentation.transition || 'slide-horizontal')
    }
  }, [selectedPresentation])

  const handleUpdatePresentation = async () => {
    if (!selectedPresentation) return

    setSelectedSaving(true)
    setError(null)

    try {
      const updatedPresentation = await updatePresentation(selectedPresentation.id, {
        title: selectedTitle,
        transition: selectedTransition,
      })

      setPresentations((current) =>
        current.map((presentation) =>
          presentation.id === updatedPresentation.id ? updatedPresentation : presentation
        )
      )
      setTransitionType(updatedPresentation.transition)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Unable to update presentation')
    } finally {
      setSelectedSaving(false)
    }
  }

  const handleDeletePresentation = async () => {
    if (!selectedPresentation) return

    setError(null)

    try {
      await deletePresentation(selectedPresentation.id)
      const remaining = presentations.filter((presentation) => presentation.id !== selectedPresentation.id)
      setPresentations(remaining)
      setSelectedPresentationId(remaining[0]?.id || null)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Unable to delete presentation')
    }
  }

  const handleCreatePresentation = async () => {
    setSaving(true)
    setError(null)

    try {
      const trimmedMarkup = formMarkup.trim()
      const presentation: PresentationData = {
        id: `presentation_${Date.now()}`,
        title: formTitle,
        createdAt: new Date().toISOString(),
        theme: 'neo-brutalist',
        transition: formTransition,
        slides: [],
        totalSlides: 0,
        customMarkup: trimmedMarkup || undefined,
      }

      const created = await createPresentation(presentation)
      setPresentations((current) => [created, ...current])
      setSelectedPresentationId(created.id)
      setTransitionType(created.transition)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Unable to create presentation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-black mb-2 tracking-widest uppercase">Presentations</h1>
            <p className="text-sm opacity-70 max-w-2xl">
              Generated presentations are stored automatically and displayed here when MCP creates them.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <button
              className={`px-4 py-2 neo-border font-black uppercase text-xs ${
                transitionType === 'slide-horizontal'
                  ? 'bg-neo-black text-white neo-shadow-md'
                  : 'bg-neo-bg neo-btn-active hover:bg-neo-secondary'
              }`}
              onClick={() => setTransitionType('slide-horizontal')}
            >
              Horizontal
            </button>
            <button
              className={`px-4 py-2 neo-border font-black uppercase text-xs ${
                transitionType === 'slide-vertical'
                  ? 'bg-neo-black text-white neo-shadow-md'
                  : 'bg-neo-bg neo-btn-active hover:bg-neo-secondary'
              }`}
              onClick={() => setTransitionType('slide-vertical')}
            >
              Vertical
            </button>
            <button
              className={`px-4 py-2 neo-border font-black uppercase text-xs ${
                transitionType === 'fade'
                  ? 'bg-neo-black text-white neo-shadow-md'
                  : 'bg-neo-bg neo-btn-active hover:bg-neo-secondary'
              }`}
              onClick={() => setTransitionType('fade')}
            >
              Fade
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4">
            <div className="p-4 bg-neo-secondary neo-border neo-shadow-sm">
              <h2 className="font-black uppercase text-xs tracking-widest mb-3">Saved Presentations</h2>
              {loading && <p className="text-sm opacity-70">Loading saved decks…</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!loading && presentations.length === 0 && (
                <p className="text-sm opacity-70">
                  No generated presentations found yet. Run the MCP tool and refresh this page.
                </p>
              )}
              <div className="space-y-2">
                {presentations.map((presentation) => (
                  <button
                    key={presentation.id}
                    className={`w-full text-left px-3 py-2 rounded neo-border neo-btn-active transition ${
                      presentation.id === selectedPresentation?.id
                        ? 'bg-neo-black text-white'
                        : 'bg-white hover:bg-neo-muted'
                    }`}
                    onClick={() => setSelectedPresentationId(presentation.id)}
                  >
                    <div className="font-black text-sm uppercase">{presentation.title}</div>
                    <div className="text-[11px] opacity-70">{presentation.slides.length} slides</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-white neo-border neo-shadow-sm">
              <h2 className="font-black uppercase text-xs tracking-widest mb-3">Create Presentation</h2>
              <label className="block text-[11px] uppercase tracking-widest mb-2 opacity-80">Title</label>
              <input
                value={formTitle}
                onChange={(event) => setFormTitle(event.target.value)}
                className="w-full mb-3 px-3 py-2 border rounded bg-neo-bg text-sm"
              />
              <label className="block text-[11px] uppercase tracking-widest mb-2 opacity-80">Presentation HTML</label>
              <textarea
                value={formMarkup}
                onChange={(event) => setFormMarkup(event.target.value)}
                rows={8}
                className="w-full mb-3 px-3 py-2 border rounded bg-neo-bg text-sm font-mono resize-none"
                placeholder="Paste full HTML markup for the slide here"
              />
              <label className="block text-[11px] uppercase tracking-widest mb-2 opacity-80">Transition</label>
              <select
                value={formTransition}
                onChange={(event) => setFormTransition(event.target.value as TransitionType)}
                className="w-full mb-4 px-3 py-2 border rounded bg-neo-bg text-sm"
              >
                <option value="slide-horizontal">Horizontal</option>
                <option value="slide-vertical">Vertical</option>
                <option value="fade">Fade</option>
              </select>
              <button
                onClick={handleCreatePresentation}
                disabled={saving}
                className="w-full px-4 py-2 font-black uppercase text-xs bg-neo-black text-white rounded hover:bg-neo-secondary transition disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Presentation'}
              </button>
            </div>

            {selectedPresentation && (
              <div className="p-4 bg-neo-bg neo-border neo-shadow-sm">
                <h3 className="font-black uppercase text-xs tracking-widest mb-3">Selected deck</h3>
                <label className="block text-[11px] uppercase tracking-widest mb-2 opacity-80">Title</label>
                <input
                  value={selectedTitle}
                  onChange={(event) => setSelectedTitle(event.target.value)}
                  className="w-full mb-3 px-3 py-2 border rounded bg-white text-sm"
                />
                <label className="block text-[11px] uppercase tracking-widest mb-2 opacity-80">Transition</label>
                <select
                  value={selectedTransition}
                  onChange={(event) => setSelectedTransition(event.target.value as TransitionType)}
                  className="w-full mb-4 px-3 py-2 border rounded bg-white text-sm"
                >
                  <option value="slide-horizontal">Horizontal</option>
                  <option value="slide-vertical">Vertical</option>
                  <option value="fade">Fade</option>
                </select>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleUpdatePresentation}
                    disabled={selectedSaving}
                    className="px-4 py-2 font-black uppercase text-xs bg-neo-black text-white rounded hover:bg-neo-secondary transition disabled:opacity-50"
                  >
                    {selectedSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleDeletePresentation}
                    className="px-4 py-2 font-black uppercase text-xs bg-red-600 text-white rounded hover:bg-red-700 transition"
                  >
                    Delete Presentation
                  </button>
                </div>
                <p className="text-xs opacity-60 mt-3">Created {new Date(selectedPresentation.createdAt).toLocaleString()}</p>
              </div>
            )}
          </aside>

          <section className="space-y-6">
            {selectedPresentation ? (
              <SlideDeck slides={customPresentationSlide ?? slideNodes} transition={transitionType} />
            ) : (
              <div className="p-10 bg-white neo-border neo-shadow-md text-center">
                <p className="text-lg font-black">Waiting for MCP-generated presentations.</p>
                <p className="mt-3 text-sm opacity-70">
                  Use the AI/MCP skill to create a presentation and it will appear here automatically.
                </p>
              </div>
            )}

            <div className="p-4 bg-neo-muted neo-border">
              <h3 className="font-black mb-2 uppercase">How it works</h3>
              <ul className="text-sm space-y-1 list-disc ml-6">
                <li>The MCP server creates the presentation and saves it into app storage.</li>
                <li>Open this page to see saved decks and preview them instantly.</li>
                <li>Use arrow keys, Space, F, and Esc while viewing slides.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
