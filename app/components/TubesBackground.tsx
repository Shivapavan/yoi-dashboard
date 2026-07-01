'use client'

import { useEffect, useRef } from 'react'

const YOI_TUBES   = ['#0D9488', '#D97706', '#9333EA']          // teal · amber · purple
const YOI_LIGHTS  = ['#0D9488', '#F472B6', '#D97706', '#7C3AED'] // teal · pink · amber · violet

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

export default function TubesBackground({ children, className, enableClick = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef   = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    let mounted = true

    // webpackIgnore tells the bundler to leave this import as-is;
    // the browser resolves it as a native ES module (no eval required).
    // @ts-ignore — TypeScript doesn't allow URL strings in import()
    import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js')
      .then((mod: any) => {
        if (!mounted || !canvasRef.current) return
        const TubesCursor = mod.default ?? mod
        appRef.current = TubesCursor(canvasRef.current, {
          tubes: {
            colors: YOI_TUBES,
            lights: { intensity: 220, colors: YOI_LIGHTS },
          },
        })
      })
      .catch((err: unknown) => console.error('TubesCursor init failed', err))

    return () => { mounted = false }
  }, [])

  const handleCanvasClick = () => {
    if (!enableClick || !appRef.current) return
    appRef.current.tubes?.setColors(randColors(3))
    appRef.current.tubes?.setLightsColors(randColors(4))
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {/* WebGL canvas — click on the background to randomize colors */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ touchAction: 'none' }}
        onClick={handleCanvasClick}
      />
      {/* Content overlay — pointer-events-none so clicks fall through to canvas;
          interactive children must set pointer-events-auto individually */}
      <div className="relative z-10 w-full pointer-events-none">
        {children}
      </div>
    </div>
  )
}
