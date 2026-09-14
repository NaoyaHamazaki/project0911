import { useState } from 'react'
import { Link } from 'react-router-dom'

import GeneralSettingsPanel from '../components/GeneralSettingsPanel'
import PromptSettingsPanel from '../components/PromptSettingsPanel'
import TableStatusPanel from '../components/TableStatusPanel'

type Tab = 'prompt' | 'tables' | 'general'

const TABS: { key: Tab; label: string }[] = [
  { key: 'prompt', label: 'プロンプト文面' },
  { key: 'tables', label: 'テーブル状況' },
  { key: 'general', label: '全般設定' },
]

/**
 * 管理者用の設定画面。
 *
 * 本番では使わない想定の一時的な機能。backend の ADMIN_MENU_ENABLED が
 * 有効なときだけヘッダーのナビに出て、この画面のAPIも動く（無効時はAPIが404を返す）。
 * 「プロンプト文面」「テーブル状況」「全般設定」をタブで切り替える。
 */
export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>('prompt')

  return (
    <div className="page">
      <h1 className="page__title">管理者設定</h1>
      <p className="page__lead admin-settings__warning">
        <strong>本番環境では表示されない一時的な画面です。</strong>
      </p>

      <div className="admin-settings__tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'chip chip--selected' : 'chip'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'prompt' && <PromptSettingsPanel />}
      {tab === 'tables' && <TableStatusPanel />}
      {tab === 'general' && <GeneralSettingsPanel />}

      <div className="form__actions">
        <Link to="/" className="button button--ghost">
          ホームへ
        </Link>
      </div>
    </div>
  )
}
