import { useEffect, useState } from 'react'

interface Props {
  name: string | null
  onDone: () => void
}

export function GreetingOverlay({ name, onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'visible' | 'out'>('in')

  useEffect(() => {
    if (!name) return
    setPhase('in')
    const t1 = setTimeout(() => setPhase('visible'), 500)
    const t2 = setTimeout(() => setPhase('out'), 4000)
    const t3 = setTimeout(() => onDone(), 4500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [name, onDone])

  if (!name) return null

  return (
    <div className={`greeting-overlay greeting-overlay--${phase}`}>
      <div className="greeting-overlay__content">
        <div className="greeting-overlay__hello">Hola,</div>
        <div className="greeting-overlay__name">{name}</div>
      </div>
    </div>
  )
}
