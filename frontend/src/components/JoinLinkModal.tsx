import { useState } from 'react'

type Props = {
  url: string
  /** 新規作成中に、リンク発行のため旅を保存したときの旅ID */
  savedTripId?: string | null
  onClose: () => void
}

/** 一緒に行く人へ送る意見募集リンクを表示・コピーするポップアップ。 */
export default function JoinLinkModal({ url, savedTripId, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // クリップボードAPIが使えない環境では、表示中のURLを長押しでコピーしてもらう。
      setCopied(false)
    }
  }

  const lineText = `旅のいきたいところを教えてください！\n${url}`

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="join-link-title" onClick={onClose}>
      <div className="modal__panel" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal__title" id="join-link-title">
          一緒に行く人から意見を集める
        </h2>
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
        <div className="modal__actions">
          <button type="button" className="button button--primary" onClick={() => void copy()}>
            {copied ? 'コピー済み' : 'コピー'}
          </button>
          <a
            className="button button--ghost"
            href={`https://line.me/R/share?text=${encodeURIComponent(lineText)}`}
            target="_blank"
            rel="noreferrer"
          >
            LINEで送る
          </a>
        </div>
        <button type="button" className="field-shortcut join-link__close" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
