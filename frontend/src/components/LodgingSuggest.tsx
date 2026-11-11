import { useState } from 'react'

import { AppError, BusinessError, api } from '../lib/api'
import type { HotelSuggestionNight, Lodging } from '../lib/types'

type Props = {
  theme: string
  departure: string
  destination: string
  dateFrom: string
  dateTo: string
  lodgings: Lodging[]
  maxNights: number
  /** 何泊目（0始まり）にこの宿を入れるか */
  onSelect: (index: number, name: string) => void
}

/**
 * STEP3の宿泊先のAI候補。泊ごとに5件ずつ、提案理由とGoogleマップ・公式サイトのリンクを付けて出す。
 * 「この泊にする」で、その泊の宿名欄に入る。もう一度押すと、表示中の宿を除いて出し直す。
 */
export default function LodgingSuggest({
  theme,
  departure,
  destination,
  dateFrom,
  dateTo,
  lodgings,
  maxNights,
  onSelect,
}: Props) {
  const [nights, setNights] = useState<HotelSuggestionNight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetched, setFetched] = useState(false)

  const hasDestination = Boolean(destination.trim())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const shown = nights.flatMap((night) => night.hotels.map((hotel) => hotel.name))
      const data = await api.suggestLodgings({
        theme,
        departure,
        destination,
        date_from: dateFrom,
        date_to: dateTo,
        exclude: [...new Set(shown)],
      })
      setNights(data.nights)
      setFetched(true)
      if (data.nights.every((night) => night.hotels.length === 0)) {
        setError('候補が見つかりませんでした。時間をおいてもう一度お試しください。')
      }
    } catch (err) {
      if (err instanceof BusinessError) setError(err.errors[0]?.message ?? '候補を取得できませんでした。')
      else setError(err instanceof AppError ? err.message : '候補を取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="spot-suggest">
      <div className="spot-suggest__head">
        <span className="field__label">AIのおすすめ宿</span>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => void load()}
          disabled={loading || !hasDestination}
        >
          {fetched ? '別の候補' : '候補を出す'}
        </button>
      </div>
      <p className="field__hint">
        {hasDestination
          ? `行先・日程・テーマをもとに、泊ごとに5件ずつ提案します。${
              lodgings.length > maxNights ? `（${maxNights}泊目までの提案になります）` : ''
            }`
          : 'STEP2で行先を入力すると候補を出せます。'}
      </p>
      {loading && (
        <div className="spinner-row" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>宿を探しています（10〜20秒ほどかかります）...</span>
        </div>
      )}
      {error && !loading && <p className="spot-suggest__error">{error}</p>}
      {!loading &&
        nights.map((night) => {
          const index = night.night - 1
          const currentName = lodgings[index]?.value.trim() ?? ''
          return (
            <section className="spot-suggest__group" key={night.night}>
              <h3 className="spot-suggest__area">
                {night.night}泊目
                {night.area && <span className="spot-suggest__count">{night.area}</span>}
              </h3>
              {night.hotels.length === 0 ? (
                <p className="field__hint">この泊の候補は見つかりませんでした。</p>
              ) : (
                <ul className="spot-suggest__list hotel-suggest__list">
                  {night.hotels.map((hotel) => (
                    <li className="spot-card hotel-card" key={hotel.name}>
                      <p className="spot-card__name">{hotel.name}</p>
                      {hotel.reason && <p className="spot-card__summary">{hotel.reason}</p>}
                      {hotel.address && <p className="spot-card__for">{hotel.address}</p>}
                      <p className="spot-card__source">
                        <a href={hotel.maps_url} target="_blank" rel="noreferrer">
                          Googleマップ
                        </a>
                        {hotel.website && (
                          <>
                            {' ／ '}
                            <a href={hotel.website} target="_blank" rel="noreferrer">
                              公式サイト
                            </a>
                          </>
                        )}
                      </p>
                      <div className="spot-card__actions">
                        {currentName === hotel.name ? (
                          <span className="spot-card__added">{night.night}泊目に設定済み</span>
                        ) : (
                          <button
                            type="button"
                            className="button button--primary button--small"
                            onClick={() => onSelect(index, hotel.name)}
                          >
                            この泊にする
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
    </div>
  )
}
