import { useEffect, useState } from 'react'

import ErrorPanel from '../components/ErrorPanel'
import { AppError, BusinessError, api } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { getDeviceKey } from '../lib/storage'
import type { Choice, FeatureRequestItem, FieldError } from '../lib/types'

export default function RequestsPage() {
  const [nickname, setNickname] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [categories, setCategories] = useState<Choice[]>([])
  const [open, setOpen] = useState(true)
  const [items, setItems] = useState<FeatureRequestItem[]>([])
  const [businessErrors, setBusinessErrors] = useState<FieldError[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const load = async () => {
    setAppError(null)
    try {
      const [optionData, listData] = await Promise.all([api.options(), api.featureRequests()])
      setCategories(optionData.feature_request_categories)
      setOpen(optionData.feature_request_open)
      setItems(listData.results)
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : '要望一覧を取得できませんでした。')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setDone(false)
    setBusinessErrors([])
    setAppError(null)
    if (!body.trim()) {
      setBusinessErrors([{ field: 'body', message: '要望の内容を入力してください。' }])
      return
    }
    setConfirming(true)
  }

  const send = async () => {
    setSubmitting(true)
    try {
      await api.createFeatureRequest({
        nickname: nickname.trim(),
        category,
        body: body.trim(),
        device_key: getDeviceKey(),
      })
      setConfirming(false)
      setDone(true)
      setNickname('')
      setCategory('')
      setBody('')
      await load()
    } catch (error) {
      setConfirming(false)
      if (error instanceof BusinessError) {
        setBusinessErrors(error.errors)
      } else if (error instanceof AppError) {
        setAppError(error.message)
      } else {
        setAppError('予期しないエラーが発生しました。')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const categoryLabel = (value: string) => categories.find((c) => c.value === value)?.label ?? ''

  return (
    <div className="page">
      <h1 className="page__title">アプリへの要望</h1>
      <p className="page__lead">「こんな機能がほしい」「ここが使いにくい」を教えてください。</p>

      <ErrorPanel businessErrors={businessErrors} appError={appError} onRetry={() => void load()} />

      {done && (
        <div className="notice notice--success" role="status">
          要望を送信しました。ありがとうございます！
        </div>
      )}

      {!open && (
        <div className="notice notice--info" role="status">
          現在、要望の受付を停止しています。いただいた要望の一覧はご覧いただけます。
        </div>
      )}

      <form className="card" onSubmit={handleSubmit} noValidate hidden={!open}>
        <h2 className="card__title">要望を書く</h2>

        <div className="field">
          <label className="field__label" htmlFor="nickname">
            ニックネーム
          </label>
          <input
            id="nickname"
            type="text"
            className="input"
            value={nickname}
            placeholder="未入力の場合は「名無し」で表示されます"
            maxLength={50}
            onChange={(event) => setNickname(event.target.value)}
          />
        </div>

        <div className="field">
          <span className="field__label">カテゴリ</span>
          <div className="choice-chips">
            {categories.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={category === choice.value ? 'chip chip--selected' : 'chip'}
                onClick={() => setCategory(category === choice.value ? '' : choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="body">
            要望の内容<span className="field__required">必須</span>
          </label>
          <textarea
            id="body"
            className="input textarea"
            value={body}
            rows={5}
            maxLength={1000}
            placeholder="例）作ったプロンプトをテンプレートとして保存しておきたいです。"
            onChange={(event) => setBody(event.target.value)}
          />
          <p className="field__hint">{body.length} / 1000文字</p>
        </div>

        <div className="form__actions">
          <button type="submit" className="button button--primary">
            送信する
          </button>
        </div>
      </form>

      <section className="card">
        <h2 className="card__title">みんなの要望（{items.length}件）</h2>
        {items.length === 0 ? (
          <p className="summary__empty">まだ要望はありません。最初の1件をどうぞ。</p>
        ) : (
          <ul className="request-list">
            {items.map((item) => (
              <li className="request-list__item" key={item.id}>
                <div className="request-list__head">
                  <span className="request-list__name">{item.nickname || '名無し'}</span>
                  {item.category && <span className="request-list__tag">{categoryLabel(item.category)}</span>}
                  <span className="request-list__date">{formatDateTime(item.created_at)}</span>
                </div>
                <p className="request-list__body">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirming && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="modal__panel">
            <h2 className="modal__title" id="confirm-title">
              この内容で送信します
            </h2>
            <p className="modal__text">送信した要望は一覧に公開されます。よろしいですか？</p>
            <blockquote className="modal__quote">{body}</blockquote>
            <div className="modal__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                戻る
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void send()}
                disabled={submitting}
              >
                {submitting ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
