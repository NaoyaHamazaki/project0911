import { useState } from 'react'

import { AppError, BusinessError, api } from '../lib/api'
import type { Lodging, SpotSuggestion, SpotSuggestionGroup } from '../lib/types'

type Props = {
  theme: string
  destination: string
  lodgings: Lodging[]
  dateFrom: string
  dateTo: string
  /** すでにMUST/WANTに入っている場所（候補から除外し、追加済み表示にする） */
  added: { must: string[]; want: string[] }
  onAdd: (kind: 'must_spots' | 'want_spots', name: string) => void
}

// 地図の埋め込み。APIキー不要の埋め込みURLを使う（ブラウザにキーを渡さないため）。
const mapEmbedUrl = (spot: SpotSuggestion, area: string) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(spot.address || `${spot.name} ${area}`)}&output=embed&hl=ja`

/**
 * テーマ・行先・STEP2の宿泊先・日程をもとに、AI（Gemini）がいきたいスポットの候補を出す。
 * 複数の都市にまたがる旅は地域ごとに分け、件数は日数に応じて増減する。
 * 利用料を抑えるため、ボタンを押したときだけ取得する。
 */
export default function SpotSuggestions({ theme, destination, lodgings, dateFrom, dateTo, added, onAdd }: Props) {
  const [groups, setGroups] = useState<SpotSuggestionGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetched, setFetched] = useState(false)

  const hasPlace = Boolean(destination.trim()) || lodgings.some((lodging) => lodging.value.trim())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // いま表示中の候補と、追加済みの場所は次の候補から外してもらう。
      const shown = groups.flatMap((group) => group.spots.map((spot) => spot.name))
      const exclude = [...added.must, ...added.want, ...shown].filter((name) => name.trim())
      const data = await api.suggestSpots({ theme, destination, lodgings, date_from: dateFrom, date_to: dateTo, exclude })
      setGroups(data.groups)
      setFetched(true)
      if (data.groups.length === 0) setError('候補が見つかりませんでした。時間をおいてもう一度お試しください。')
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
        <span className="field__label">AIのおすすめ候補</span>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => void load()}
          disabled={loading || !hasPlace}
        >
          {fetched ? '別の候補' : '候補を出す'}
        </button>
      </div>
      <p className="field__hint">
        {hasPlace
          ? '行先・宿泊先・日数をもとに提案します。気になる場所は［MUST］［WANT］で上のリストに追加できます。'
          : 'STEP1の行先か、STEP2の宿泊先を入力すると候補を出せます。'}
      </p>
      {loading && (
        <div className="spinner-row" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>候補を探しています（10秒ほどかかります）...</span>
        </div>
      )}
      {error && !loading && <p className="spot-suggest__error">{error}</p>}
      {!loading &&
        groups.map((group) => (
          <section className="spot-suggest__group" key={group.area}>
            {groups.length > 1 && (
              <h3 className="spot-suggest__area">
                {group.area}
                <span className="spot-suggest__count">{group.spots.length}件</span>
              </h3>
            )}
            <ul className="spot-suggest__list">
              {group.spots.map((spot) => {
                const inMust = added.must.includes(spot.name)
                const inWant = added.want.includes(spot.name)
                return (
                  <li className="spot-card" key={spot.name}>
                    <div className="spot-card__body">
                      <p className="spot-card__name">
                        <span className="contrib__tag">{spot.category}</span>
                        {spot.name}
                      </p>
                      {spot.summary && <p className="spot-card__summary">{spot.summary}</p>}
                      {spot.recommended_for && <p className="spot-card__for">おすすめ：{spot.recommended_for}</p>}
                      <p className="spot-card__source">
                        出典：
                        <a href={spot.maps_url} target="_blank" rel="noreferrer">
                          Googleマップ
                        </a>
                        {spot.website && (
                          <>
                            {' ／ '}
                            <a href={spot.website} target="_blank" rel="noreferrer">
                              公式サイト
                            </a>
                          </>
                        )}
                      </p>
                      <div className="spot-card__actions">
                        {inMust || inWant ? (
                          <span className="spot-card__added">{inMust ? 'MUST' : 'WANT'}に追加済み</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="button button--primary button--small"
                              onClick={() => onAdd('must_spots', spot.name)}
                            >
                              MUST
                            </button>
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              onClick={() => onAdd('want_spots', spot.name)}
                            >
                              WANT
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <iframe
                      className="spot-card__map"
                      title={`${spot.name}の地図`}
                      src={mapEmbedUrl(spot, group.area)}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
    </div>
  )
}
