import type { ComponentType } from 'react'
import { ClockWidget } from './ClockWidget'
import { ServicesWidget } from './ServicesWidget'
import { SpotifyWidget } from './SpotifyWidget'
import { WeatherWidget } from './WeatherWidget'

export interface WidgetDescriptor {
  id: string
  area: 'clock' | 'weather' | 'spotify' | 'services'
  Component: ComponentType
}

// CalendarWidget, GmailWidget y ExchangeWidget quedaron fuera del dashboard (poco valor
// real en la práctica) pero sus archivos y fuentes se dejan intactos por si se retoman.
export const registry: WidgetDescriptor[] = [
  { id: 'clock', area: 'clock', Component: ClockWidget },
  { id: 'weather', area: 'weather', Component: WeatherWidget },
  { id: 'spotify', area: 'spotify', Component: SpotifyWidget },
  { id: 'services', area: 'services', Component: ServicesWidget },
]
