import type { SpotifyAction, SpotifyData } from '../../shared/api-types'
import { postAction } from '../lib/api'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 5 * 1000

function sendCommand(action: SpotifyAction) {
  void postAction(`/api/spotify/${action}`)
}

// Solo control remoto: los botones mandan comandos al dispositivo que ya esté activo en Spotify
// Connect (celular, parlante, etc.) — el audio nunca sale del kiosk. Sin WidgetFrame ni estados
// de loading/error visibles a propósito: "todavía no cargó" y "no hay nada sonando" son
// indistinguibles para quien mira el kiosk, así que en ambos casos no se muestra nada — el
// widget solo ocupa espacio en pantalla cuando hay música real sonando.
export function SpotifyWidget() {
  const { data } = useWidgetData<SpotifyData>('/api/spotify', POLL_MS)

  if (!data || !data.isPlaying) return null

  const progressPct = data.durationMs > 0 ? (data.progressMs / data.durationMs) * 100 : 0

  return (
    <section className="widget spotify">
      <div className="spotify__now">
        {data.albumArtUrl && (
          <img className="spotify__art" src={data.albumArtUrl} alt="" />
        )}
        <div className="spotify__info">
          <div className="spotify__track">{data.trackName}</div>
          <div className="spotify__artist">{data.artistName}</div>
        </div>
      </div>
      <div className="spotify__progress">
        <div className="spotify__progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="spotify__controls">
        <button className="spotify__btn" onClick={() => sendCommand('previous')} aria-label="Anterior">
          ⏮
        </button>
        <button
          className="spotify__btn spotify__btn--main"
          onClick={() => sendCommand(data.isPlaying ? 'pause' : 'play')}
          aria-label={data.isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {data.isPlaying ? '⏸' : '▶'}
        </button>
        <button className="spotify__btn" onClick={() => sendCommand('next')} aria-label="Siguiente">
          ⏭
        </button>
      </div>
    </section>
  )
}
