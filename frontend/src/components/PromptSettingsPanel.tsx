import { useEffect, useState } from 'react'

import ErrorPanel from './ErrorPanel'
import { AppError, api } from '../lib/api'
import type { PromptSettingItem } from '../lib/types'

/** プロンプトの文面を編集するタブ（管理者設定画面の「プロンプト文面」タブ）。 */
export default function PromptSettingsPanel() {
  const [items, setItems] = useState<PromptSettingItem[] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setAppError(null)
    try {
      const data = await api.promptSettings()
      setItems(data.items)
      setValues(Object.fromEntries(data.items.map((item) => [item.key, item.value])))
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

  const handleSave = async () => {
    setSaving(true)
    setAppError(null)
    setSaved(false)
    try {
      await api.savePromptSettings(values)
      setSaved(true)
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : '保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = (key: string, defaultValue: string) => {
    setValues((current) => ({ ...current, [key]: defaultValue }))
    setSaved(false)
  }

  return (
    <>
      <p className="page__lead">
        出力されるプロンプトの文面を編集します。ここでの変更は、以降に新しく作成されるプロンプトから反映されます
        （過去に作成済みのプロンプトは変わりません）。
      </p>

      <ErrorPanel appError={appError} onRetry={() => void load()} />

      {saved && (
        <div className="notice notice--success" role="status">
          保存しました。
        </div>
      )}

      {loading ? (
        <p className="loading">読み込み中...</p>
      ) : (
        items && (
          <>
            {items.map((item) => (
              <section className="card" key={item.key}>
                <div className="card__header">
                  <h2 className="card__title">{item.label}</h2>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => resetToDefault(item.key, item.default)}
                  >
                    既定文に戻す
                  </button>
                </div>
                <textarea
                  className="input textarea admin-settings__textarea"
                  value={values[item.key] ?? ''}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [item.key]: event.target.value }))
                    setSaved(false)
                  }}
                />
              </section>
            ))}

            <div className="form__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </>
        )
      )}
    </>
  )
}
