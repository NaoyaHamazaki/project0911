import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import ErrorPanel from '../components/ErrorPanel'
import { AppError, api } from '../lib/api'
import type { PublicTripSummary } from '../lib/types'

/** 「他の人が作った旅」の一覧。公開された旅（個人情報を伏せた公開版）を新しい順に20件まで出す。 */
export default function PublicTripsPage() {
  const [trips, setTrips] = useState<PublicTripSummary[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setAppError(null)
    try {
      const data = await api.publicTrips()
      setTrips(data.results)
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : '取得に失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="page">
      <h1 className="page__title">他の人が作った旅</h1>
      <p className="page__lead">
        みんなが公開した旅のプロンプトです（新しい順に20件）。名前や連絡先は伏せてあり、日程は月と泊数だけを載せています。
      </p>

      <ErrorPanel appError={appError} onRetry={() => void load()} />

      {loading ? (
        <p className="loading">読み込み中...</p>
      ) : trips.length === 0 && !appError ? (
        <section className="card">
          <p className="summary__empty">まだ公開された旅はありません。</p>
          <div className="form__actions">
            <Link to="/create" className="button button--primary">
              旅のしおりを作る
            </Link>
          </div>
        </section>
      ) : (
        <ul className="trip-list">
          {trips.map((trip) => (
            <li key={trip.public_key}>
              <Link to={`/public/${trip.public_key}`} className="trip-list__item">
                <span className="trip-list__title">{trip.title}</span>
                <span className="trip-list__period">
                  {[trip.destination, trip.month_label, trip.period_label].filter(Boolean).join('・')}
                </span>
                {trip.theme && <span className="trip-list__meta">{trip.theme}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
