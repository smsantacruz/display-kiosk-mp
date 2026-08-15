import type { GmailData } from '../../shared/api-types'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 2 * 60 * 1000

function formatCount(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}k`
  return String(n)
}

export function GmailWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<GmailData>(
    '/api/gmail',
    POLL_MS,
  )

  return (
    <WidgetFrame title="Gmail" status={status} updatedAt={updatedAt} errorMessage={errorMessage}>
      {data && (
        <div className="gmail">
          <div className="gmail__count">
            <span className="gmail__unread-number">{formatCount(data.unreadCount)}</span>
            <span className="gmail__unread-label">no leídos</span>
          </div>

          {data.unread.length > 0 && (
            <ul className="gmail__list">
              {data.unread.map((msg) => (
                <li key={msg.id} className="gmail__item">
                  <span className="gmail__from">{msg.from}</span>
                  <span className="gmail__subject">{msg.subject}</span>
                </li>
              ))}
            </ul>
          )}

          {data.starred.length > 0 && (
            <>
              <div className="gmail__divider">★ Destacados</div>
              <ul className="gmail__list">
                {data.starred.map((msg) => (
                  <li key={msg.id} className="gmail__item">
                    <span className="gmail__from">{msg.from}</span>
                    <span className="gmail__subject">{msg.subject}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.unreadCount === 0 && data.starred.length === 0 && (
            <p className="widget__note">Inbox vacío</p>
          )}
        </div>
      )}
    </WidgetFrame>
  )
}
