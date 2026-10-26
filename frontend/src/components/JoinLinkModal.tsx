import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

type Props = {
  /** 準備中は空文字 */
  url: string
  loading: boolean
  /** 新規作成中に、リンク発行のため旅を保存したときの旅ID */
  savedTripId?: string | null
  onClose: () => void
}

/**
 * 一緒に行く人へ送る意見募集リンクを表示・コピーするポップアップ。
 * 対面で会っているときは、QRコードを見せてその場で読み取ってもらえる。
 *
 * ページ側のアニメーション（transform）の影響で画面の一部に閉じ込められないよう、
 * body 直下に描画して、アプリ全体をグレーの幕で覆う。
 */
export default function JoinLinkModal({ url, loading, savedTripId, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: '#3d3227', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [url])

  // ポップアップ表示中は背面のスクロールを止める。Escキーで閉じる。
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // クリップボードAPIが使えない環境では、表示中のURLを長押しでコピーしてもらう。
      setCopied(false)
    }
  }

  return createPortal(
    <div className="modal modal--app" role="dialog" aria-modal="true" aria-labelledby="join-link-title" onClick={onClose}>
      <div className="modal__panel" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal__title" id="join-link-title">
          一緒に行く人から意見を集める
        </h2>

        {loading || !url ? (
          <div className="spinner-row spinner-row--center" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>リンクを準備しています...</span>
          </div>
        ) : (
          <>
            <p className="modal__text">
              このリンクを送ると、名前を入れて「いきたいところ」「予定」を追記してもらえます。追記された内容は、STEP3・STEP4の各欄の下に表示され、取り込むものを選べます。
            </p>
            {savedTripId && (
              <p className="modal__text">
                リンクを作るため、ここまでの入力を旅ID <strong>{savedTripId}</strong> として保存しました。このまま入力を続けられます。
              </p>
            )}
            <div className="feedback-url">
              <code className="feedback-url__text">{url}</code>
            </div>
            {showQr && (
              <div className="join-link__qr">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="意見募集リンクのQRコード" width={220} height={220} />
                ) : (
                  <p className="summary__empty">QRコードを作成できませんでした。</p>
                )}
                <p className="field__hint">相手のスマホのカメラで読み取ってもらってください。</p>
              </div>
            )}
            <div className="modal__actions">
              <button type="button" className="button button--primary" onClick={() => void copy()}>
                {copied ? 'コピー済み' : 'コピー'}
              </button>
              <button
                type="button"
                className="button button--ghost"
                aria-expanded={showQr}
                onClick={() => setShowQr((current) => !current)}
              >
                {showQr ? 'QRを隠す' : 'QRを表示'}
              </button>
            </div>
          </>
        )}

        <button type="button" className="button button--ghost join-link__close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  )
}
