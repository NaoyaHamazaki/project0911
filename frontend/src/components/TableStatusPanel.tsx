import { useEffect, useState } from 'react'

import ErrorPanel from './ErrorPanel'
import { AppError, api } from '../lib/api'
import type { TableInfo } from '../lib/types'

type Rows = { columns: string[]; rows: Record<string, unknown>[]; limit: number }

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** 作成済みテーブルの参照専用ビュー（管理者設定画面の「テーブル状況」タブ）。 */
export default function TableStatusPanel() {
  const [engine, setEngine] = useState('')
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selected, setSelected] = useState<string>('')
  const [rows, setRows] = useState<Rows | null>(null)
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setAppError(null)
    try {
      const data = await api.tableStatus()
      setEngine(data.engine)
      setTables(data.tables)
      if (!selected && data.tables.length > 0) setSelected(data.tables[0].table)
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : 'テーブル情報を取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    api
      .tableRows(selected)
      .then((data) => {
        if (!cancelled) setRows({ columns: data.columns, rows: data.rows, limit: data.limit })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRows(null)
          setAppError(error instanceof AppError ? error.message : '行データを取得できませんでした。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const current = tables.find((table) => table.table === selected)

  return (
    <>
      <p className="page__lead">
        作成済みのテーブルを参照のみで確認できます（更新・削除はできません）。端末キーは一部を伏せて表示します。
      </p>

      <ErrorPanel appError={appError} onRetry={() => void load()} />

      {loading ? (
        <p className="loading">読み込み中...</p>
      ) : (
        <>
          <section className="card">
            <h2 className="card__title">テーブル一覧</h2>
            <p className="field__hint">接続エンジン: {engine}</p>
            <div className="table-tabs">
              {tables.map((table) => (
                <button
                  key={table.table}
                  type="button"
                  className={selected === table.table ? 'chip chip--selected' : 'chip'}
                  onClick={() => setSelected(table.table)}
                >
                  {table.table}
                  <span className="table-tabs__count">{table.count ?? '—'}</span>
                </button>
              ))}
            </div>
          </section>

          {current && (
            <section className="card">
              <h2 className="card__title">
                {current.table}（{current.verbose_name}）
              </h2>
              <p className="field__hint">
                {current.count ?? 0}件 ／ 表示は先頭{rows?.limit ?? 100}件まで
              </p>

              <h3 className="card__subtitle">カラム定義</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>カラム</th>
                      <th>名称</th>
                      <th>型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.columns.map((column) => (
                      <tr key={column.name}>
                        <td>{column.name}</td>
                        <td>{column.verbose_name}</td>
                        <td>{column.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="card__subtitle">データ</h3>
              {rows && rows.rows.length > 0 ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {rows.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.rows.map((row, index) => (
                        <tr key={index}>
                          {rows.columns.map((column) => (
                            <td key={column} title={cellText(row[column])}>
                              {cellText(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="summary__empty">データがありません。</p>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}
