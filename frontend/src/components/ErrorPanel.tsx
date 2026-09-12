import { labelOf } from '../lib/fieldLabels'
import type { FieldError } from '../lib/types'

type Props = {
  /** 入力内容の誤り（ビジネスエラー） */
  businessErrors?: FieldError[]
  /** 通信不能やサーバー異常（アプリケーションエラー） */
  appError?: string | null
  onRetry?: () => void
}

export default function ErrorPanel({ businessErrors = [], appError, onRetry }: Props) {
  if (businessErrors.length === 0 && !appError) return null

  return (
    <div className="error-panel" role="alert" aria-live="assertive">
      {appError && (
        <div className="error-panel__block error-panel__block--app">
          <p className="error-panel__title">うまく処理できませんでした</p>
          <p className="error-panel__message">{appError}</p>
          {onRetry && (
            <button type="button" className="button button--ghost" onClick={onRetry}>
              もう一度試す
            </button>
          )}
        </div>
      )}
      {businessErrors.length > 0 && (
        <div className="error-panel__block">
          <p className="error-panel__title">入力内容を確認してください（{businessErrors.length}件）</p>
          <ul className="error-panel__list">
            {businessErrors.map((error, index) => (
              <li key={`${error.field}-${index}`}>
                <span className="error-panel__field">{labelOf(error.field)}</span>
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
