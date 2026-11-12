import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import ErrorPanel from '../components/ErrorPanel'
import PublicTripSummary from '../components/PublicTripSummary'
import { AppError, api } from '../lib/api'
import type { PublicTrip } from '../lib/types'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 公開された旅の閲覧ページ（/public/:publicKey）。見るだけで編集はできない。
 * プロンプトはコピーして、自分の生成AIで使える。
 */
export default function PublicTripPage() {
  const { publicKey = '' } = useParams()
  const [trip, setTrip] = useState<PublicTrip | null>(null)
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setAppError(null)
    try {
      setTrip(await api.publicTrip(publicKey))
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : 'データを取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }, [publicKey])

  useEffect(() => {
    void load()
  }, [load])

  const copy = async (text: string, message: string) => {
    const ok = await copyText(text)
    setToast(ok ? message : 'コピーできませんでした。長押しで選択してコピーしてください。')
    window.setTimeout(() => setToast(''), 2400)
  }

  if (loading) {
    return (
      <div className="page">
        <p className="loading">読み込み中...</p>
      </div>
    )
  }

  if (appError || !trip) {
    return (
      <div className="page">
        <ErrorPanel appError={appError ?? 'この旅は見つかりませんでした。'} onRetry={() => void load()} />
        <div className="form__actions">
          <Link to="/public" className="button button--ghost">
            他の人が作った旅へ
          </Link>
        </div>
      </div>
    )
  }

  const outputs = [
    { key: 'itinerary', title: '行程表プロンプト', text: trip.prompt_text, copied: '行程表プロンプトをコピーしました' },
    { key: 'image', title: '画像生成用プロンプト', text: trip.image_prompt_text, copied: '画像生成用プロンプトをコピーしました' },
  ].filter((output) => output.text)

  return (
    <div className="page">
      <p className="page__eyebrow">他の人が作った旅</p>
      <h1 className="page__title">{trip.title}</h1>
      <p className="page__lead">
        公開された旅のプロンプトです（名前や連絡先は伏せてあります）。コピーして生成AIに貼り付ければ、同じ条件で行程表を作れます。
      </p>

      <section className="card">
        <h2 className="card__title">旅の内容</h2>
        <PublicTripSummary trip={trip} />
      </section>

      {outputs.map((output) => (
        <section className="card" key={output.key}>
          <div className="card__header">
            <h2 className="card__title">{output.title}</h2>
            <div className="card__header-actions">
              <button
                type="button"
                className="button button--ghost button--small"
                aria-expanded={Boolean(open[output.key])}
                onClick={() => setOpen((current) => ({ ...current, [output.key]: !current[output.key] }))}
              >
                {open[output.key] ? '隠す' : '確認'}
              </button>
              <button
                type="button"
                className="button button--primary button--small"
                onClick={() => void copy(output.text, output.copied)}
              >
                コピー
              </button>
            </div>
          </div>
          {open[output.key] && <pre className="prompt-preview">{output.text}</pre>}
        </section>
      ))}

      <div className="form__actions form__actions--multi">
        <Link to="/public" className="button button--ghost">
          一覧へ戻る
        </Link>
        <Link to="/create" className="button button--primary">
          自分の旅を作る
        </Link>
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}
