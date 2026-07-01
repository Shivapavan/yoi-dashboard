'use client'

import { useEffect, useRef } from 'react'

const YOI_TUBES  = ['#0D9488', '#D97706', '#9333EA']
const YOI_LIGHTS = ['#0D9488', '#F472B6', '#D97706', '#7C3AED']

function randColors(n: number) {
  return Array.from({ length: n }, () =>
    '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
  )
}

interface Props {
  children?: React.ReactNode
  className?: string
  enableClick?: boolean
}

declare global {
  interface Window { __TubesCursor?: (canvas: HTMLCanvasElement, opts: object) => any }
}

export default function TubesBackground({ children, className, enableClick = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef   = useRef<any>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const initCursor = () => {
      if (!canvasRef.current || !window.__TubesCursor) return
      try {
        appRef.current = window.__TubesCursor(canvasRef.current, {
          tubes: {
            colors: YOI_TUBES,
            lights: { intensity: 220, colors: YOI_LIGHTS },
          },
        })
      } catch (e) {
        console.error('TubesCursor init error', e)
      }
    }

    if (window.__TubesCursor) {
      // Already loaded from a previous render
      initCursor()
      return
    }

    // Inject <script type="module" src="/tubes-init.js"> — allowed by script-src 'self'
    // The module sets window.__TubesCursor and fires 'TubesCursorReady'
    if (!document.getElementById('tubes-init')) {
      const s = document.createElement('script')
      s.id   = 'tubes-init'
      s.type = 'module'
      s.src  = '/tubes-init.js'
      document.head.appendChild(s)
    }

    document.addEventListener('TubesCursorReady', initCursor, { once: true })
    return () => document.removeEventListener('TubesCursorReady', initCursor)
  }, [])

  const handleCanvasClick = () => {
    if (!enableClick || !appRef.current) return
    appRef.current.tubes?.setColors(randColors(3))
    appRef.current.tubes?.setLightsColors(randColors(4))
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ touchAction: 'none' }}
        onClick={handleCanvasClick}
      />
      <div className="relative z-10 w-full pointer-events-none">
        {children}
      </div>
    </div>
  )
}
