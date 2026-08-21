import type { ExchangeData } from '../../shared/api-types'
import { WidgetFrame } from '../components/WidgetFrame'
import { useWidgetData } from '../hooks/useWidgetData'

const POLL_MS = 5 * 60 * 1000

const fmtArs = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const fmtUsd = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

export function ExchangeWidget() {
  const { data, status, updatedAt, errorMessage } = useWidgetData<ExchangeData>(
    '/api/exchange',
    POLL_MS,
  )

  return (
    <WidgetFrame title="Cotización" status={status} updatedAt={updatedAt} errorMessage={errorMessage}>
      {data && (
        <div className="exchange">
          <div className="exchange__row">
            <span className="exchange__label">Dólar blue</span>
            <span className="exchange__value">{fmtArs(data.dolarBlue.venta)}</span>
          </div>
          <div className="exchange__row">
            <span className="exchange__label">Dólar oficial</span>
            <span className="exchange__value">{fmtArs(data.dolarOficial.venta)}</span>
          </div>
          <div className="exchange__row">
            <span className="exchange__label">BTC/USDT</span>
            <span className="exchange__value">{fmtUsd(data.btcUsdt)}</span>
          </div>
        </div>
      )}
    </WidgetFrame>
  )
}
