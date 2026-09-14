import { useEffect, useState } from 'react'

import ErrorPanel from './ErrorPanel'
import { AppError, api } from '../lib/api'

/** 管理者設定画面の「全般設定」タブ。編集(再編集)の権限まわりを扱う。 */
export default function GeneralSettingsPanel() {
  const [requiresSameDevice, setRequiresSameDevice] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setAppError(null)
    try {
      const data = await api.generalSettings()
      setRequiresSameDevice(data.edit_requires_same_device)
    } catch (error) {
      setAppError(
        error instanceof AppError
          ? error.status === 404
            ? 'この機能は現在無効です（ADMIN_MENU_ENABLED が設定されていません）。'
            : error.message
          : '取得に失敗しました。',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleChange = async (checked: boolean) => {
    setRequiresSameDevice(checked)
    setSaving(true)
    setSaved(false)
    setAppError(null)
    try {
      await api.saveGeneralSettings({ edit_requires_same_device: checked })
      setSaved(true)
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : '保存に失敗しました。')
      setRequiresSameDevice(!checked) // 失敗したら表示を戻す
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <p className="page__lead">アプリ全体の動作に関わる設定です。</p>

      <ErrorPanel appError={appError} onRetry={() => void load()} />

      {saved && (
        <div className="notice notice--success" role="status">
          保存しました。
        </div>
      )}

      {loading ? (
        <p className="loading">読み込み中...</p>
      ) : (
        <section className="card">
          <h2 className="card__title">再編集の許可範囲</h2>
          <p className="field__hint">
            結果ページの「再編集」から、旅IDを知っている人なら誰でも内容を上書きできます。
            チェックを入れると、作成した端末以外からの編集を拒否するようになります。
          </p>
          <label className="consistency-check__item">
            <input
              type="checkbox"
              checked={requiresSameDevice}
              disabled={saving}
              onChange={(event) => void handleChange(event.target.checked)}
            />
            <span>編集には作成した端末との一致を必須にする</span>
          </label>
        </section>
      )}
    </>
  )
}
