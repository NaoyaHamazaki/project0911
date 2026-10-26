import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import ErrorPanel from '../components/ErrorPanel'
import { AppError, BusinessError, api } from '../lib/api'
import { formatPeriod } from '../lib/format'
import type { FeedbackInfo, FieldError } from '../lib/types'

/**
 * 旅行意見聴取の回答ページ（参加者向け）。ログイン不要で意見を送れる。
 * 送られた意見は主催者が結果ページで読み、必要なら再編集で反映する。
 */
export default function FeedbackPage() {
  const { tripId = '' } = useParams()
  const [info, setInfo] = useState<FeedbackInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [appError, setAppError] = useState<string | null>(null)
  const [businessErrors, setBusinessErrors] = useState<FieldError[]>([])
  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setAppError(null)
    try {
      setInfo(await api.tripFeedback(tripId))
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : '読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusinessErrors([])
    setAppError(null)
    if (!body.trim()) {
      setBusinessErrors([{ field: 'body', message: '意見を入力してください。' }])
      return
    }
    setSending(true)
    try {
      await api.sendTripFeedback(tripId, { nickname: nickname.trim(), body: body.trim() })
      setSent(true)
      setBody('')
    } catch (error) {
      if (error instanceof BusinessError) setBusinessErrors(error.errors)
      else setAppError(error instanceof AppError ? error.message : '送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="loading">読み込み中...</p>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="page">
        <ErrorPanel appError={appError ?? '旅が見つかりませんでした。'} onRetry={() => void load()} />
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page__title">旅行の意見を送る</h1>

      <section className="card card--trip">
        <p className="trip-meta__title">{info.title}</p>
        <p className="trip-meta__period">{formatPeriod(info.date_from, info.date_to)}</p>
        {info.destination && <p className="trip-meta__id">行先：{info.destination}</p>}
      </section>

      {!info.open ? (
        <div className="notice notice--info">この旅では現在、意見を受け付けていません。</div>
      ) : (
        <>
          <p className="page__lead">
            行きたい場所、食べたいもの、苦手なこと、予算感など、なんでも書いてください。幹事さんがしおり作りの参考にします。
          </p>

          <ErrorPanel businessErrors={businessErrors} appError={appError} />

          {sent && (
            <div className="notice notice--success" role="status">
              送信しました。ありがとうございます！続けて送ることもできます。
            </div>
          )}

          <form className="card" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field__label" htmlFor="fb-nickname">
                ニックネーム
              </label>
              <input
                id="fb-nickname"
                type="text"
                className="input"
                value={nickname}
                maxLength={50}
                placeholder="未入力なら「名無し」になります"
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="fb-body">
                意見<span className="field__required">必須</span>
              </label>
              <textarea
                id="fb-body"
                className="input textarea"
                value={body}
                maxLength={1000}
                placeholder="例）2日目は温泉に入りたい／朝早いのは苦手です"
                onChange={(event) => {
                  setBody(event.target.value)
                  setSent(false)
                }}
              />
              <p className="field__hint">{body.length} / 1000文字</p>
            </div>
            <div className="form__actions">
              <button type="submit" className="button button--primary" disabled={sending}>
                {sending ? '送信中...' : '送信する'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
