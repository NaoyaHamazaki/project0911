import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()
  const [tripId, setTripId] = useState('')

  const openTrip = (event: React.FormEvent) => {
    event.preventDefault()
    const id = tripId.trim().toUpperCase()
    if (!id) return
    navigate(`/trip/${encodeURIComponent(id)}`)
  }

  return (
    <div className="home">
      <section className="home__hero">
        <p className="home__lead">友達との旅行、しおりを作ろう。</p>
        <h1 className="home__title">
          旅のしおりの
          <br />
          プロンプトを作る
        </h1>
        <Link to="/create" className="button button--primary button--hero">
          旅のしおりを作る
        </Link>
        <p className="home__note">このアプリは、友達との旅行のしおりを作成するためのものです。<br />
「旅のしおりを作る」ボタンを押すとフォームがひらくので、<br />
旅行の計画を入力してみてください
        </p>
      </section>

      <section className="home__sub">
        <form className="home__find" onSubmit={openTrip}>
          <label className="field__label" htmlFor="trip-id-input">
            旅IDから開く
          </label>
          <p className="field__hint">作成済みのプロンプトは、旅ID（T…）を入れればいつでも開けます。</p>
          <div className="home__find-row">
            <input
              id="trip-id-input"
              type="text"
              className="input"
              value={tripId}
              placeholder="T4K9XQP2"
              onChange={(event) => setTripId(event.target.value)}
            />
            <button type="submit" className="button button--ghost" disabled={!tripId.trim()}>
              開く
            </button>
          </div>
        </form>

        <div className="home__links">
          <Link to="/my-trips" className="home__link-card">
            <span className="home__link-title">この端末で作った旅</span>
            <span className="home__link-desc">ログインなしで、作成履歴をふり返れます</span>
          </Link>
          <Link to="/requests" className="home__link-card">
            <span className="home__link-title">アプリへの要望を送る</span>
            <span className="home__link-desc">こんな機能がほしい、を教えてください</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
