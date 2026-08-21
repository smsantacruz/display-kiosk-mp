import type { ComponentType } from 'react'
import { CalendarWidget } from './CalendarWidget'
import { ClockWidget } from './ClockWidget'
import { ServicesWidget } from './ServicesWidget'
import { WeatherWidget } from './WeatherWidget'

export interface WidgetDescriptor {
  id: string
  area: 'clock' | 'weather' | 'calendar' | 'services'
  Component: ComponentType
}

export const registry: WidgetDescriptor[] = [
  { id: 'clock', area: 'clock', Component: ClockWidget },
  { id: 'weather', area: 'weather', Component: WeatherWidget },
  { id: 'calendar', area: 'calendar', Component: CalendarWidget },
  { id: 'services', area: 'services', Component: ServicesWidget },
]
