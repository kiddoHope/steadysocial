import React from 'react'

export type SlideProps = {
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
  background?: string
}

export default function Slide({ title, children, className = '', background }: SlideProps) {
  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center p-8 text-center ${className}`}
      style={{ background: background ?? 'transparent' }}
    >
      {title && (
        <h2 className="text-4xl font-extrabold mb-6 tracking-widest uppercase">
          {title}
        </h2>
      )}
      <div className="prose max-w-4xl text-left">{children}</div>
    </div>
  )
}
