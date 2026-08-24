import { useCallback, useEffect, useState } from 'react'
import { GreetingOverlay } from './components/GreetingOverlay'
import { postAction } from './lib/api'
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

function App() {
  const [shiftIndex, setShiftIndex] = useState(0)
  const [greetingName, setGreetingName] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      setShiftIndex((i) => (i + 1) % SHIFT_CYCLE.length)
    }, SHIFT_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    (window as any).onPalmRecognized = (name: string) => {
      setGreetingName(name)
      // Le pone play a lo que ya estaba sonando en Spotify Connect (celular, parlante, etc.) —
      // no hace nada si no había nada pausado/en cola, y no rompe el saludo si Spotify falla.
      void postAction('/api/spotify/play')
    }
    return () => { delete (window as any).onPalmRecognized }
  }, [])

  const handleGreetingDone = useCallback(() => setGreetingName(null), [])

  const [x, y] = SHIFT_CYCLE[shiftIndex]

  return (
    <>
      <main className="dashboard" style={{ translate: `${x}px ${y}px` }}>
        {registry.map(({ id, area, Component }) => (
          <div key={id} className={`cell cell--${area}`} style={{ gridArea: area }}>
            <Component />
          </div>
        ))}
      </main>
      <GreetingOverlay name={greetingName} onDone={handleGreetingDone} />
    </>
  )
}

export default App
