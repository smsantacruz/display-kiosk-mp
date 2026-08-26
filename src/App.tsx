import { useCallback, useEffect, useState } from 'react'
import type { SpotifyData } from '../shared/api-types'
import { GreetingOverlay } from './components/GreetingOverlay'
import { fetchWidget, postAction } from './lib/api'
import { registry } from './widgets/registry'

// Anti burn-in AMOLED: todo el contenido se desplaza unos px siguiendo un ciclo lento.
const SHIFT_CYCLE: Array<[number, number]> = [
  [0, 0],
  [2, 1],
  [0, 2],
  [-2, 1],
  [-2, -1],
  [0, -2],
  [2, -1],
]
const SHIFT_MS = 5 * 60 * 1000

// Atenúa la pantalla de madrugada — pura molestia lumínica en la habitación, el ahorro de
// electricidad real es insignificante. Un filter de brillo alcanza; no hace falta tocar nada
// de Android (brightness del sistema, permisos, etc.).
const NIGHT_START_HOUR = 0
const NIGHT_END_HOUR = 6
const NIGHT_DIM_FACTOR = 0.15
const NIGHT_CHECK_MS = 60 * 1000

function isNightTime(): boolean {
  const hour = new Date().getHours()
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR
}

// Gesto de "acercar la palma" como control de música: si está sonando la pausa, si está
// pausada/parada le da play — un toggle, no un "siempre reanudar" unidireccional.
async function toggleSpotifyPlayback() {
  try {
    const envelope = await fetchWidget<SpotifyData>('/api/spotify')
    const isPlaying = envelope.ok && envelope.data.isPlaying
    await postAction(isPlaying ? '/api/spotify/pause' : '/api/spotify/play')
  } catch {
    // sin conexión momentánea: no rompe el saludo por esto
  }
}

function App() {
  const [shiftIndex, setShiftIndex] = useState(0)
  const [greetingName, setGreetingName] = useState<string | null>(null)
  const [isNight, setIsNight] = useState(isNightTime)

  useEffect(() => {
    const id = setInterval(() => {
      setShiftIndex((i) => (i + 1) % SHIFT_CYCLE.length)
    }, SHIFT_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setIsNight(isNightTime()), NIGHT_CHECK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    (window as any).onPalmRecognized = (name: string) => {
      setGreetingName(name)
      void toggleSpotifyPlayback()
    }
    return () => { delete (window as any).onPalmRecognized }
  }, [])

  const handleGreetingDone = useCallback(() => setGreetingName(null), [])

  const [x, y] = SHIFT_CYCLE[shiftIndex]

  return (
    <div
      style={{
        // height/width 100% importan: filter crea un containing block nuevo para los hijos
        // position:fixed (el GreetingOverlay) — sin esto, dejarían de cubrir la pantalla entera.
        height: '100%',
        width: '100%',
        filter: `brightness(${isNight ? NIGHT_DIM_FACTOR : 1})`,
        transition: 'filter 3s ease',
      }}
    >
      <main className="dashboard" style={{ translate: `${x}px ${y}px` }}>
        {registry.map(({ id, area, Component }) => (
          <div key={id} className={`cell cell--${area}`} style={{ gridArea: area }}>
            <Component />
          </div>
        ))}
      </main>
      <GreetingOverlay name={greetingName} onDone={handleGreetingDone} />
    </div>
  )
}

export default App
