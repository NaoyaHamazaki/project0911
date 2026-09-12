import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import ErrorPanel from '../components/ErrorPanel'
import { AppError, api } from '../lib/api'
import { formatDateTime, formatPeriod } from '../lib/format'
import { getDeviceKey } from '../lib/storage'
import type { TripSummary } from '../lib/types'

export default function MyTripsPage() {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setAppError(null)
    try {
      const data = await api.myTrips(getDeviceKey())
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
      <h1 className="page__title">この端末で作った旅</h1>
      <p className="page__lead">
        ログインなしで、この端末から作成したプロンプトを表示しています。端末を変えたときは旅IDで開いてください。
      </p>

      <ErrorPanel appError={appError} onRetry={() => void load()} />

      {loading ? (
        <p className="loading">読み込み中...</p>
      ) : trips.length === 0 ? (
        <section className="card">
          <p className="summary__empty">まだ作成した旅はありません。</p>
          <div className="form__actions">
            <Link to="/create" className="button button--primary">
              プロンプトを作る
            </Link>
          </div>
        </section>
      ) : (
        <ul className="trip-list">
          {trips.map((trip) => (
            <li key={trip.trip_id}>
              <Link to={`/trip/${trip.trip_id}`} className="trip-list__item">
                <span className="trip-list__title">{trip.title}</span>
                <span className="trip-list__period">{formatPeriod(trip.date_from, trip.date_to)}</span>
                <span className="trip-list__meta">
                  {trip.trip_id} ／ 作成 {formatDateTime(trip.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
