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
  /** 何泊目（0始まり）にこの宿を入れるか。name が空なら、その泊の宿名を消す */
  onSelect: (index: number, name: string) => void
}

/**
 * STEP3の宿泊先のAI候補。泊ごとに5件ずつ取得し、泊で区切らず1つのリストで出す。
 * 各候補の「〇泊目」ボタンで、その泊の宿名欄に入る（選択中のボタンをもう一度押すと外す）。
 * 「別の候補」で、表示中の宿を除いて出し直す。
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

  // 泊ごとの区切りをやめて1つのリストにまとめる（同じ宿が複数の泊に出たら最初の1件だけ）。
  const seen = new Set<string>()
  const hotels = nights.flatMap((night) =>
    night.hotels
      .filter((hotel) => !seen.has(hotel.name) && Boolean(seen.add(hotel.name)))
      .map((hotel) => ({ hotel, night: night.night, area: night.area })),
  )

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
          ? `行先・日程・テーマをもとに、泊ごとに5件ずつ提案します。各候補の「〇泊目」ボタンで、その泊に入れられます。${
              lodgings.length > maxNights ? `（候補のエリアは${maxNights}泊目までをもとに選びます）` : ''
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
      {!loading && hotels.length > 0 && (
        <ul className="spot-suggest__list hotel-suggest__list">
          {hotels.map(({ hotel, night, area }) => (
            <li className="spot-card hotel-card" key={hotel.name}>
              <p className="spot-card__name">{hotel.name}</p>
              <p className="hotel-card__tag">
                {night}泊目向け{area ? `・${area}` : ''}
              </p>
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
              <div className="spot-card__actions hotel-card__nights">
                {lodgings.map((lodging, index) => {
                  const selected = lodging.value.trim() === hotel.name
                  return (
                    <button
                      type="button"
                      key={index}
                      className={
                        selected
                          ? 'button button--primary button--small hotel-card__night'
                          : 'button button--ghost button--small hotel-card__night'
                      }
                      aria-pressed={selected}
                      title={selected ? `${index + 1}泊目から外す` : `${index + 1}泊目に入れる`}
                      onClick={() => onSelect(index, selected ? '' : hotel.name)}
                    >
                      {selected ? '✓ ' : ''}
                      {index + 1}泊目
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
