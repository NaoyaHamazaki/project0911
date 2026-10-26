import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'

import ErrorPanel from '../components/ErrorPanel'
import { AppError, api } from '../lib/api'
import { formatDateTime, formatPeriod } from '../lib/format'
import { saveDraft, startEditing } from '../lib/storage'
import { tripToForm, type Contribution, type Trip } from '../lib/types'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // クリップボードAPIが使えない環境（http接続など）向けのフォールバック。
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

export default function ResultPage() {
  const { tripId = '' } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [toast, setToast] = useState('')
  // プロンプト本文はデフォルト非表示。「確認」ボタンでそれぞれ開閉する。
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [contributions, setContributions] = useState<Contribution[]>([])

  const shareUrl = `${window.location.origin}/trip/${tripId}`

  const load = useCallback(async () => {
    setLoading(true)
    setAppError(null)
    try {
      setTrip(await api.getTrip(tripId))
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : 'データを取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!trip) return
    QRCode.toDataURL(shareUrl, { margin: 1, width: 320, color: { dark: '#3d3227', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [trip, shareUrl])

  // 意見募集リンクを発行済みの旅だけ、参加者からの追記を読み込む。
  useEffect(() => {
    if (!trip?.join_key) return
    api
      .contributions(trip.trip_id)
      .then((data) => setContributions(data.results))
      .catch(() => setContributions([]))
  }, [trip])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const handleCopy = async (text: string, message: string) => {
    const ok = await copyToClipboard(text)
    notify(ok ? message : 'コピーできませんでした。長押しで選択してコピーしてください。')
  }

  const handleWebShare = async () => {
    const shareText = `${trip?.title ?? '旅のしおり'}のプロンプト（旅ID: ${tripId}）`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'たびしおりプロンプト', text: shareText, url: shareUrl })
      } catch {
        // ユーザーがキャンセルした場合は何もしない。
      }
      return
    }
    await handleCopy(`${shareText}\n${shareUrl}`, 'この端末は共有メニューに対応していないため、URLをコピーしました。')
  }

  const handleReEdit = () => {
    if (!trip) return
    saveDraft(tripToForm(trip))
    startEditing(trip.trip_id)
    navigate('/create')
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
        <ErrorPanel appError={appError ?? 'データが見つかりませんでした。'} onRetry={() => void load()} />
        <div className="form__actions">
          <Link to="/" className="button button--ghost">
            ホームへ戻る
          </Link>
        </div>
      </div>
    )
  }

  const joinUrl = trip.join_key ? `${window.location.origin}/join/${trip.join_key}` : ''
  const outputs = [
    {
      key: 'itinerary',
      title: '行程表プロンプト',
      hint: 'ChatGPT・Gemini などのチャットAIに貼り付けると、日ごとの行程表（テキスト）を作ってくれます。',
      text: trip.prompt_text,
      copied: '行程表プロンプトをコピーしました',
    },
    {
      key: 'image',
      title: '画像生成用プロンプト',
      hint: '画像生成AIに貼り付けると、デザイン指示に沿ったしおりの表紙画像を作ってくれます。',
      text: trip.image_prompt_text,
      copied: '画像生成用プロンプトをコピーしました',
      // 出力設定で画像出力をONにした旅だけ表示する。
      hidden: !trip.image_enabled && !trip.image_prompt_text,
    },
  ]

  const shareText = `「${trip.title}」の旅のしおりプロンプトを作りました！`
  const mailBody = `${shareText}\n\n旅ID: ${trip.trip_id}\n${shareUrl}\n\n----- プロンプト -----\n${trip.prompt_text}`

  return (
    <div className="page">
      <h1 className="page__title">プロンプトができました</h1>
      <p className="page__lead">
        用途に合わせて2種類のプロンプトをコピーし、生成AIに貼り付けてください。旅IDを控えておけば、あとからいつでも開けます。
      </p>

      <section className="card card--trip">
        <p className="trip-meta__title">{trip.title}</p>
        <p className="trip-meta__period">{formatPeriod(trip.date_from, trip.date_to)}</p>
        <div className="trip-meta__id-row">
          <p className="trip-meta__id">
            旅ID <strong>{trip.trip_id}</strong>
          </p>
          <button type="button" className="button button--ghost button--small" onClick={handleReEdit}>
            再編集
          </button>
        </div>
      </section>

      {outputs.filter((output) => !('hidden' in output && output.hidden)).map((output) => (
        <section className="card" key={output.key}>
          <div className="card__header">
            <h2 className="card__title">{output.title}</h2>
            <div className="card__header-actions">
              <button
                type="button"
                className="button button--ghost button--small"
                aria-expanded={Boolean(visible[output.key])}
                onClick={() => setVisible((current) => ({ ...current, [output.key]: !current[output.key] }))}
              >
                {visible[output.key] ? '隠す' : '確認'}
              </button>
              <button
                type="button"
                className="button button--primary button--small"
                disabled={!output.text}
                onClick={() => void handleCopy(output.text, output.copied)}
              >
                コピー
              </button>
            </div>
          </div>
          <p className="field__hint">{output.hint}</p>
          {visible[output.key] &&
            (output.text ? (
              <pre className="prompt-preview">{output.text}</pre>
            ) : (
              <p className="summary__empty">まだ作成されていません。「再編集」から保存し直すと作成されます。</p>
            ))}
        </section>
      ))}

      {joinUrl && (
        <section className="card">
          <h2 className="card__title">一緒に行く人からの意見（{contributions.length}件）</h2>
          <p className="field__hint">
            届いた意見は自動では反映されません。「再編集」のSTEP3・STEP4で、取り込む項目を選んでください。
          </p>
          <div className="feedback-url">
            <code className="feedback-url__text">{joinUrl}</code>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void handleCopy(joinUrl, '意見募集リンクをコピーしました')}
            >
              リンクをコピー
            </button>
          </div>
          {contributions.length === 0 ? (
            <p className="summary__empty">まだ意見は届いていません。</p>
          ) : (
            <ul className="request-list">
              {contributions.map((item) => (
                <li className="request-list__item" key={item.id}>
                  <div className="request-list__head">
                    <span className="request-list__name">{item.name}</span>
                    <span className="request-list__date">{formatDateTime(item.created_at)}</span>
                  </div>
                  <p className="request-list__body">
                    {[
                      ...item.must_spots.map((spot) => `MUST：${spot}`),
                      ...item.want_spots.map((spot) => `WANT：${spot}`),
                      ...(item.spot_notes?.trim() ? [`メモ：${item.spot_notes.trim()}`] : []),
                      ...item.constraints.map((row) => `予約済み：${row.content}`),
                      ...item.rough_plans.flatMap((plan, index) => (plan.trim() ? [`${index + 1}日目：${plan}`] : [])),
                      ...(item.notes?.trim() ? [`考慮事項・備考：${item.notes.trim()}`] : []),
                    ].join('\n')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card card--qr">
        <h2 className="card__title">QRコードで渡す</h2>
        <p className="field__hint">スクリーンショットを撮って送れば、旅IDごと共有できます。</p>
        {qrDataUrl ? (
          <img className="qr" src={qrDataUrl} alt={`${trip.trip_id} のQRコード`} width={200} height={200} />
        ) : (
          <p className="summary__empty">QRコードを生成できませんでした。</p>
        )}
        <p className="qr__id">{trip.trip_id}</p>
      </section>

      <section className="card">
        <h2 className="card__title">共有する</h2>
        <p className="field__hint">旅IDとURLを共有すれば、友達も同じプロンプトを開けます。</p>
        <div className="share-grid">
          <button type="button" className="share-button" onClick={() => void handleWebShare()}>
            <span className="share-button__icon" aria-hidden="true">
              ⤴
            </span>
            端末の共有
            <small>Instagramなど</small>
          </button>
          <a
            className="share-button"
            href={`https://line.me/R/share?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="share-button__icon" aria-hidden="true">
              💬
            </span>
            LINE
          </a>
          <a
            className="share-button"
            href={`mailto:?subject=${encodeURIComponent(`旅のしおりプロンプト：${trip.title}`)}&body=${encodeURIComponent(mailBody)}`}
          >
            <span className="share-button__icon" aria-hidden="true">
              ✉
            </span>
            メール
          </a>
          <a
            className="share-button"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="share-button__icon" aria-hidden="true">
              𝕏
            </span>
            X
          </a>
          <button
            type="button"
            className="share-button"
            onClick={() => void handleCopy(shareUrl, 'URLをコピーしました')}
          >
            <span className="share-button__icon" aria-hidden="true">
              🔗
            </span>
            URLをコピー
          </button>
          <button
            type="button"
            className="share-button"
            onClick={() => void handleCopy(trip.trip_id, '旅IDをコピーしました')}
          >
            <span className="share-button__icon" aria-hidden="true">
              #
            </span>
            旅IDをコピー
          </button>
        </div>
      </section>

      <div className="form__actions">
        <Link to="/" className="button button--ghost">
          ホームへ
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
