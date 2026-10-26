import { useState } from 'react'

import { AppError, BusinessError, api } from '../lib/api'
import type { Lodging, SpotSuggestion } from '../lib/types'

type Props = {
  theme: string
  destination: string
  lodgings: Lodging[]
  /** すでにMUST/WANTに入っている場所（候補から除外し、追加済み表示にする） */
  added: { must: string[]; want: string[] }
  onAdd: (kind: 'must_spots' | 'want_spots', name: string) => void
}

/**
 * テーマ・行先・STEP2の宿泊先をもとに、AI（Gemini）がいきたいスポットの候補を出す。
 * 利用料を抑えるため、ボタンを押したときだけ取得する。
 */
export default function SpotSuggestions({ theme, destination, lodgings, added, onAdd }: Props) {
  const [results, setResults] = useState<SpotSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetched, setFetched] = useState(false)

  const hasPlace = Boolean(destination.trim()) || lodgings.some((lodging) => lodging.value.trim())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      // いま表示中の候補と、追加済みの場所は次の候補から外してもらう。
      const exclude = [...added.must, ...added.want, ...results.map((spot) => spot.name)].filter((name) => name.trim())
      const data = await api.suggestSpots({ theme, destination, lodgings, exclude })
      setResults(data.results)
      setFetched(true)
      if (data.results.length === 0) setError('候補が見つかりませんでした。時間をおいてもう一度お試しください。')
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
          {loading ? '探しています...' : fetched ? '別の候補' : '候補を出す'}
        </button>
      </div>
      <p className="field__hint">
        {hasPlace
          ? 'テーマ・行先・宿泊先をもとに提案します。気になる場所は［MUST］［WANT］で上のリストに追加できます。'
          : 'STEP1の行先か、STEP2の宿泊先を入力すると候補を出せます。'}
      </p>
      {error && <p className="spot-suggest__error">{error}</p>}
      {results.length > 0 && (
        <ul className="spot-suggest__list">
          {results.map((spot) => {
            const inMust = added.must.includes(spot.name)
            const inWant = added.want.includes(spot.name)
            return (
              <li className="spot-card" key={spot.name}>
                <p className="spot-card__name">{spot.name}</p>
                {spot.summary && <p className="spot-card__summary">{spot.summary}</p>}
                {spot.recommended_for && <p className="spot-card__for">おすすめ：{spot.recommended_for}</p>}
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
