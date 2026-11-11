import { useState, type ReactNode } from 'react'

import { AppError, BusinessError, api } from '../lib/api'
import type { DestinationSuggestion } from '../lib/types'

type Props = {
  theme: string
  departure: string
  destinationScope: string
  dateFrom: string
  dateTo: string
  current: string
  enabled: boolean
  missing: boolean
  onSelect: (name: string) => void
  /** 行先の入力欄（見出しと候補一覧のあいだに置く） */
  children: ReactNode
}

/**
 * STEP1の行先欄。見出しの隣の「候補を出す」で、テーマ・出発地・範囲・日程から行先の候補を3件出す。
 * もう一度押すと、それまでに出した候補を除いて別の3件を出す。
 */
export default function DestinationSuggest({
  theme,
  departure,
  destinationScope,
  dateFrom,
  dateTo,
  current,
  enabled,
  missing,
  onSelect,
  children,
}: Props) {
  const [items, setItems] = useState<DestinationSuggestion[]>([])
  const [shown, setShown] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const hasDates = Boolean(dateFrom && dateTo)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.suggestDestinations({
        theme,
        departure,
        destination_scope: destinationScope,
        date_from: dateFrom,
        date_to: dateTo,
        exclude: shown,
      })
      setItems(data.destinations)
      setShown((previous) => [...previous, ...data.destinations.map((item) => item.name)].slice(-30))
      if (data.destinations.length === 0) setError('候補が見つかりませんでした。時間をおいてもう一度お試しください。')
    } catch (err) {
      if (err instanceof BusinessError) setError(err.errors[0]?.message ?? '候補を取得できませんでした。')
      else setError(err instanceof AppError ? err.message : '候補を取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="field">
      <div className="field__label-row">
        <label className="field__label" htmlFor="destination">
          行先<span className="field__required">必須</span>
        </label>
        {enabled && (
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => void load()}
            disabled={loading || !hasDates}
            title={hasDates ? undefined : '日程を入力すると候補を出せます'}
          >
            {shown.length > 0 ? '別の候補' : '候補を出す'}
          </button>
        )}
      </div>
      <p className="field__hint">
        おおまかな方面で構いません。
        {enabled && !hasDates && '日程を入力すると「候補を出す」でAIに提案してもらえます。'}
      </p>
      {children}
      {missing && <p className="field__error">行先を入力してください。</p>}

      {loading && (
        <div className="spinner-row" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>行先の候補を考えています...</span>
        </div>
      )}
      {error && !loading && <p className="spot-suggest__error">{error}</p>}
      {!loading && items.length > 0 && (
        <ul className="dest-suggest">
          {items.map((item) => {
            const selected = current.trim() === item.name
            return (
              <li className="spot-card dest-suggest__card" key={item.name}>
                <p className="spot-card__name">{item.name}</p>
                {item.reason && <p className="spot-card__summary">{item.reason}</p>}
                {item.highlights.length > 0 && (
                  <ul className="dest-suggest__highlights">
                    {item.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                )}
                <div className="spot-card__actions">
                  {selected ? (
                    <span className="spot-card__added">行先に設定済み</span>
                  ) : (
                    <button
                      type="button"
                      className="button button--primary button--small"
                      onClick={() => onSelect(item.name)}
                    >
                      行先にする
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
