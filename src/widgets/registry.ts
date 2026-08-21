import type { ComponentType } from 'react'
import { ClockWidget } from './ClockWidget'
import { ExchangeWidget } from './ExchangeWidget'
import { ServicesWidget } from './ServicesWidget'
import { WeatherWidget } from './WeatherWidget'

export interface WidgetDescriptor {
  id: string
  area: 'clock' | 'weather' | 'exchange' | 'services'
  Component: ComponentType
}

// CalendarWidget y GmailWidget quedaron fuera del dashboard (poco valor real en
// la práctica) pero sus archivos y fuentes se dejan intactos por si se retoman.
export const registry: WidgetDescriptor[] = [
  { id: 'clock', area: 'clock', Component: ClockWidget },
  { id: 'weather', area: 'weather', Component: WeatherWidget },
  { id: 'exchange', area: 'exchange', Component: ExchangeWidget },
  { id: 'services', area: 'services', Component: ServicesWidget },
]
