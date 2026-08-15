import type { CalendarData, CalendarEvent } from '../../shared/api-types'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 30 * 1000

function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return 'Todo el día'
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function countdownLabel(startIso: string): string | null {
  const mins = Math.round((new Date(startIso).getTime() - Date.now()) / 60_000)
  if (mins < 0) return null
  if (mins === 0) return 'ahora'
  return `en ${mins} min`
}

export function CalendarWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<CalendarData>(
    '/api/calendar',
    POLL_MS,
  )

  return (
    <WidgetFrame title="Hoy" status={status} updatedAt={updatedAt} errorMessage={errorMessage}>
      {data && (
        <div className="calendar">
          {data.today.length === 0 && data.tomorrow.length === 0 && (
            <p className="widget__note">Sin reuniones</p>
          )}

          {data.today.map((event: CalendarEvent) => {
            const isNext = data.nextUp?.id === event.id
            const countdown = isNext ? countdownLabel(event.start) : null
            return (
              <div
                key={event.id}
                className={`calendar__event${isNext ? ' calendar__event--next' : ''}`}
              >
                <span className="calendar__time">{formatTime(event.start, event.isAllDay)}</span>
                <span className="calendar__summary">{event.summary}</span>
                {countdown && <span className="calendar__countdown">{countdown}</span>}
              </div>
            )
          })}

          {data.today.length === 0 && data.tomorrow.length > 0 && (
            <>
              <div className="calendar__section-label">Mañana</div>
              {data.tomorrow.map((event: CalendarEvent) => (
                <div key={event.id} className="calendar__event calendar__event--tomorrow">
                  <span className="calendar__time">{formatTime(event.start, event.isAllDay)}</span>
                  <span className="calendar__summary">{event.summary}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </WidgetFrame>
  )
}
