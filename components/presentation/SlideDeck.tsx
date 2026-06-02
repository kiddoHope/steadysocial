import React, { useEffect, useRef, useState } from 'react'
import Slide from './Slide'

export type TransitionType = 'slide-horizontal' | 'slide-vertical' | 'fade'

type SlideItem = {
  id: string | number
  node: React.ReactNode
}

export interface SlideDeckProps {
  slides: SlideItem[]
  transition?: TransitionType
}

export default function SlideDeck({ slides, transition = 'slide-horizontal' }: SlideDeckProps) {
  const [index, setIndex] = useState(0)
  const [isFullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const prevIndex = useRef(index)

  useEffect(() => {
    prevIndex.current = index
  }, [index])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'f') toggleFullscreen()
      if (e.key === 'Escape' && isFullscreen) exitFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, isFullscreen])

  function next() {
    setIndex((i) => Math.min(i + 1, slides.length - 1))
  }
  function prev() {
    setIndex((i) => Math.max(i - 1, 0))
  }

  async function toggleFullscreen() {
    if (!containerRef.current) return
    // @ts-ignore
    const el: any = containerRef.current
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      setFullscreen(false)
    } else {
      await el.requestFullscreen?.()
      setFullscreen(true)
    }
  }

  async function exitFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      setFullscreen(false)
    }
  }

  return (
    <div className="w-full h-full">
      <div className="flex gap-3 items-center mb-4">
        <button
          className="px-3 py-2 bg-neo-black text-white neo-border neo-btn-active"
          onClick={prev}
          aria-label="Previous"
        >
          Prev
        </button>
        <button
          className="px-3 py-2 bg-neo-black text-white neo-border neo-btn-active"
          onClick={next}
          aria-label="Next"
        >
          Next
        </button>
        <div className="ml-auto text-sm opacity-70">{index + 1} / {slides.length}</div>
        <button
          className="ml-4 px-3 py-2 bg-neo-black text-white neo-border neo-btn-active"
          onClick={toggleFullscreen}
        >
          {isFullscreen ? 'Exit Full' : 'Fullscreen'}
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative w-full h-[70vh] md:h-[80vh] bg-white neo-border neo-shadow-md overflow-hidden"
      >
        {slides.map((s, i) => {
          const offset = i - index
          const isActive = i === index
          const base = 'absolute inset-0 transition-all duration-700 ease-[cubic-bezier(.22,.61,.36,1)]'
          let transformClass = 'opacity-0 scale-95 z-10 pointer-events-none'
          let activeClass = 'opacity-100 scale-100 z-20 pointer-events-auto'

          if (transition === 'slide-horizontal') {
            transformClass = offset === 0
              ? 'translate-x-0'
              : offset < 0
              ? '-translate-x-full'
              : 'translate-x-full'
          } else if (transition === 'slide-vertical') {
            transformClass = offset === 0
              ? 'translate-y-0'
              : offset < 0
              ? '-translate-y-full'
              : 'translate-y-full'
          } else if (transition === 'fade') {
            transformClass = 'opacity-0 scale-95'
            activeClass = 'opacity-100 scale-100'
          }

          return (
            <div
              key={s.id}
              className={`${base} ${isActive ? activeClass : transformClass}`}
            >
              <Slide className="w-full h-full" title={undefined}>
                {s.node}
              </Slide>
            </div>
          )
        })}
      </div>
    </div>
  )
}
