import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import ErrorPanel from '../components/ErrorPanel'
import { AppError, BusinessError, api } from '../lib/api'
import { formatDate, formatPeriod, nightsBetween } from '../lib/format'
import { clearDraft, getDeviceKey, getEditingTripId, loadDraft, stopEditing } from '../lib/storage'
import type { Choice, FieldError, Options, TripForm } from '../lib/types'

function labelOfChoice(choices: Choice[] | undefined, value: string, otherValue: string, otherText: string) {
  if (!value) return '未選択'
  if (value === otherValue) return otherText || '未入力'
  return choices?.find((choice) => choice.value === value)?.label ?? value
}

function labelOfMultiChoice(choices: Choice[] | undefined, values: string[], otherValue: string, otherText: string) {
  if (values.length === 0) return '未選択'
  return values
    .map((value) => (value === otherValue ? otherText || '未入力' : choices?.find((choice) => choice.value === value)?.label ?? value))
    .join('・')
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="summary__row">
      <dt className="summary__label">{label}</dt>
      <dd className="summary__value">{children}</dd>
    </div>
  )
}

function ListValue({ items, empty = '指定なし' }: { items: string[]; empty?: string }) {
  const filled = items.filter((item) => item.trim())
  if (filled.length === 0) return <span className="summary__empty">{empty}</span>
  return (
    <ul className="summary__list">
      {filled.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export default function ConfirmPage() {
  const navigate = useNavigate()
  const form: TripForm = useMemo(() => loadDraft(), [])
  const editingTripId = useMemo(() => getEditingTripId(), [])
  const [options, setOptions] = useState<Options | null>(null)
  const [businessErrors, setBusinessErrors] = useState<FieldError[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const nights = nightsBetween(form.date_from, form.date_to)

  const check = async () => {
    setChecking(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      // validateTrip はプロンプト本文も返すが、確認ページでは表示しないためエラー確認だけに使う。
      const [optionData] = await Promise.all([api.options(), api.validateTrip(form)])
      setOptions(optionData)
    } catch (error) {
      if (error instanceof BusinessError) {
        setBusinessErrors(error.errors)
      } else if (error instanceof AppError) {
        setAppError(error.message)
      } else {
        setAppError('予期しないエラーが発生しました。')
      }
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (!form.title && !form.date_from) {
      navigate('/create', { replace: true })
      return
    }
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOutput = async () => {
    setSubmitting(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      const trip = editingTripId
        ? await api.updateTrip(editingTripId, form, getDeviceKey())
        : await api.createTrip(form, getDeviceKey())
      clearDraft()
      stopEditing()
      navigate(`/trip/${trip.trip_id}`, { replace: true })
    } catch (error) {
      if (error instanceof BusinessError) {
        setBusinessErrors(error.errors)
      } else if (error instanceof AppError) {
        setAppError(error.message)
      } else {
        setAppError('予期しないエラーが発生しました。')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">入力内容の確認</h1>
      <p className="page__lead">
        {editingTripId
          ? `旅ID ${editingTripId} の内容を上書き更新します。直したいところがあれば戻って修正してください。`
          : 'この内容でプロンプトを出力します。直したいところがあれば戻って修正してください。'}
      </p>

      <ErrorPanel businessErrors={businessErrors} appError={appError} onRetry={() => void check()} />

      <section className="card">
        <h2 className="card__title">入力内容</h2>
        <dl className="summary">
          <SummaryRow label="タイトル">{form.title || <span className="summary__empty">未入力</span>}</SummaryRow>
          <SummaryRow label="テーマ">{form.theme || <span className="summary__empty">未入力</span>}</SummaryRow>
          <SummaryRow label="行先">{form.destination || <span className="summary__empty">未入力</span>}</SummaryRow>
          <SummaryRow label="期間">{formatPeriod(form.date_from, form.date_to)}</SummaryRow>
          <SummaryRow label="集合場所">
            {form.meeting_place || <span className="summary__empty">未入力</span>}
          </SummaryRow>
          <SummaryRow label="解散場所">
            {form.dismissal_place || <span className="summary__empty">未入力</span>}
          </SummaryRow>
          <SummaryRow label="宿泊場所">
            {nights === 0 ? (
              <span className="summary__empty">日帰り</span>
            ) : (
              <ListValue items={form.lodgings.map((l, i) => (l ? `${i + 1}泊目：${l}` : ''))} empty="未定" />
            )}
          </SummaryRow>
          <SummaryRow label="MUSTスポット">
            <ListValue items={form.must_spots} />
          </SummaryRow>
          <SummaryRow label="WANTスポット">
            <ListValue items={form.want_spots} />
          </SummaryRow>
          <SummaryRow label="スケジュール感">
            {labelOfMultiChoice(options?.schedule_paces, form.schedule_paces, options?.other_value ?? 'other', form.schedule_pace_other)}
          </SummaryRow>
          <SummaryRow label="ざっくり決まっている予定">
            {nights === 0 ? (
              <span className="summary__empty">日帰り</span>
            ) : (
              <ListValue items={form.rough_plans.map((p, i) => (p ? `${i + 1}泊目：${p}` : ''))} />
            )}
          </SummaryRow>
          <SummaryRow label="予約済みの予定">
            <ListValue
              items={form.constraints.map((row) =>
                row.content
                  ? [row.date ? formatDate(row.date) : '', row.time, row.content].filter(Boolean).join(' ')
                  : '',
              )}
            />
          </SummaryRow>
          <SummaryRow label="NG項目">
            <ListValue items={form.ng_items} />
          </SummaryRow>
          <SummaryRow label="配慮・共有メモ">
            <ListValue items={form.notes} />
          </SummaryRow>
          <SummaryRow label="自由入力欄">
            {form.free_notes || <span className="summary__empty">指定なし</span>}
          </SummaryRow>
          <SummaryRow label="デザインテイスト">
            {labelOfChoice(options?.design_tastes, form.design_taste, options?.other_value ?? 'other', form.design_taste_other)}
          </SummaryRow>
          <SummaryRow label="カラーイメージ">
            {labelOfChoice(options?.color_images, form.color_image, options?.other_value ?? 'other', form.color_image_other)}
          </SummaryRow>
          <SummaryRow label="出力サイズ">
            {labelOfChoice(options?.aspect_ratios, form.aspect_ratio, options?.other_value ?? 'other', form.aspect_ratio_other)}
          </SummaryRow>
        </dl>
      </section>

      <div className="form__actions form__actions--split">
        <Link to="/create" className="button button--ghost">
          修正する
        </Link>
        <button
          type="button"
          className="button button--primary"
          onClick={() => void handleOutput()}
          disabled={checking || submitting || businessErrors.length > 0}
        >
          {submitting ? (editingTripId ? '更新中...' : '出力中...') : editingTripId ? '更新する' : '出力'}
        </button>
      </div>
    </div>
  )
}
