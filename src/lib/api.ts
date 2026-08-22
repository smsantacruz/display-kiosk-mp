import type { Envelope } from '../../shared/api-types'

// El Worker responde el envelope JSON tanto en 200 (ok/stale) como en 502 (error).
// Los fallos de red (fetch rechazado) los maneja useWidgetData.
export async function fetchWidget<T>(path: string): Promise<Envelope<T>> {
  const res = await fetch(path, { cache: 'no-store' })
  return (await res.json()) as Envelope<T>
}

// Para acciones de control (ej. comandos de Spotify) — no devuelve datos, solo éxito/fracaso.
// Los errores se tragan a propósito: un tap de más en un botón de control no amerita romper la UI.
export async function postAction(path: string): Promise<void> {
  try {
    await fetch(path, { method: 'POST' })
  } catch {
    // sin conexión momentánea: el próximo poll refleja el estado real igual
  }
}
