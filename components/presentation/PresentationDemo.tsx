import React from 'react'
import SlideDeck from './SlideDeck'

export default function PresentationDemo() {
  const slides = [
    { id: 1, node: (<div className="p-6"><h1 className="text-5xl font-black">Welcome</h1><p className="mt-4">This is a Tailwind-styled slide.</p></div>) },
    { id: 2, node: (<div className="p-6"><h2 className="text-4xl font-extrabold">Overview</h2><ul className="mt-4 list-disc ml-6"><li>Point A</li><li>Point B</li></ul></div>) },
    { id: 3, node: (<div className="p-6 bg-neo-secondary h-full flex items-center justify-center"><h2 className="text-6xl font-black">Big Visual</h2></div>) },
  ]

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-black">Presentation Demo</h3>
      <SlideDeck slides={slides} />
    </div>
  )
}
