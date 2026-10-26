import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import ConstraintInputs from '../components/ConstraintInputs'
import ErrorPanel from '../components/ErrorPanel'
import RepeatableInputs from '../components/RepeatableInputs'
import SpotSuggestions from '../components/SpotSuggestions'
import { AppError, BusinessError, api } from '../lib/api'
import { formatPeriod } from '../lib/format'
import type { Constraint, FieldError, JoinInfo } from '../lib/types'

const MAX_ITEMS = 20

/**
 * 意見募集リンクの回答ページ（一緒に行く人向け）。ログイン不要。
 * 旅の確定情報（日程・宿泊先）は見るだけで、いきたいところ・予定を「追記」する。
 * 送った内容はあとから編集できない。取り込むかどうかは親ユーザーが決める。
 */
export default function JoinPage() {
  const { joinKey = '' } = useParams()
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [appError, setAppError] = useState<string | null>(null)
  const [businessErrors, setBusinessErrors] = useState<FieldError[]>([])
  const [name, setName] = useState('')
  const [nameEntered, setNameEntered] = useState(false)
  const [mustSpots, setMustSpots] = useState<string[]>([''])
  const [wantSpots, setWantSpots] = useState<string[]>([''])
  const [spotNotes, setSpotNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [roughPlans, setRoughPlans] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setAppError(null)
    try {
      const data = await api.joinInfo(joinKey)
      setInfo(data)
      setRoughPlans(Array.from({ length: data.days }, () => ''))
    } catch (error) {
      setAppError(error instanceof AppError ? error.message : '読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }, [joinKey])

  useEffect(() => {
    void load()
  }, [load])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const handleName = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setBusinessErrors([{ field: 'name', message: '名前を入力してください。' }])
      return
    }
    setBusinessErrors([])
    setNameEntered(true)
    scrollToTop()
  }

  const resetInputs = () => {
    setMustSpots([''])
    setWantSpots([''])
    setSpotNotes('')
    setNotes('')
    setConstraints([])
    setRoughPlans(Array.from({ length: info?.days ?? 0 }, () => ''))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusinessErrors([])
    setAppError(null)
    setSending(true)
    try {
      await api.sendContribution(joinKey, {
        name: name.trim(),
        must_spots: mustSpots.map((value) => value.trim()).filter(Boolean),
        want_spots: wantSpots.map((value) => value.trim()).filter(Boolean),
        spot_notes: spotNotes.trim(),
        constraints: constraints.filter((row) => row.content.trim()),
        rough_plans: roughPlans,
        notes: notes.trim(),
      })
      setSent(true)
      resetInputs()
      scrollToTop()
    } catch (error) {
      if (error instanceof BusinessError) setBusinessErrors(error.errors)
      else setAppError(error instanceof AppError ? error.message : '送信に失敗しました。')
      scrollToTop()
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="loading">読み込み中...</p>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="page">
        <ErrorPanel appError={appError ?? 'この意見募集リンクは見つかりませんでした。'} onRetry={() => void load()} />
      </div>
    )
  }

  const filledLodgings = info.lodgings.filter(Boolean)
  const filledSpots = (values: string[]) => values.map((value) => value.trim()).filter(Boolean)

  // AIのおすすめ候補から MUST/WANT に追加する（重複は追加しない）。
  const addSpot = (field: 'must_spots' | 'want_spots', name: string) => {
    const [values, setValues] = field === 'must_spots' ? [mustSpots, setMustSpots] : [wantSpots, setWantSpots]
    const current = filledSpots(values)
    if (current.includes(name) || current.length >= MAX_ITEMS) return
    setValues([...current, name])
  }

  return (
    <div className="page">
      <h1 className="page__title">旅のいきたいところ（場所）を教えてください</h1>

      <section className="card card--trip">
        <p className="trip-meta__title">{info.title}</p>
        <p className="trip-meta__period">{formatPeriod(info.date_from, info.date_to)}</p>
        {info.destination && <p className="trip-meta__id">行先：{info.destination}</p>}
        {info.theme && <p className="trip-meta__id">テーマ：{info.theme}</p>}
        {info.nights > 0 && filledLodgings.length > 0 && (
          <ul className="join-lodgings">
            {info.lodgings.map((text, index) =>
              text ? (
                <li key={index}>
                  {index + 1}泊目：{text}
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      <ErrorPanel businessErrors={businessErrors} appError={appError} />

      {!nameEntered ? (
        <form className="card" onSubmit={handleName} noValidate>
          <p className="field__hint">
            幹事さんが決めた日程・宿泊先をもとに、いきたいところや予定を追記できます。まずお名前を入れてください。
          </p>
          <div className="field">
            <label className="field__label" htmlFor="join-name">
              お名前<span className="field__required">必須</span>
            </label>
            <input
              id="join-name"
              type="text"
              className="input"
              value={name}
              maxLength={50}
              placeholder="例）たろう"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form__actions">
            <button type="submit" className="button button--primary">
              次へ
            </button>
          </div>
        </form>
      ) : (
        <>
          {sent && (
            <div className="notice notice--success" role="status">
              送信しました。ありがとうございます！続けて追記することもできます。
            </div>
          )}

          <form className="form" onSubmit={handleSubmit} noValidate>
            <section className="card">
              <h2 className="card__title">いきたいところ（場所）</h2>
              <p className="field__hint">{name}さんとして追記します。</p>
              <div className="field">
                <span className="field__label">MUST</span>
                <p className="field__hint">絶対に行きたい場所</p>
                <RepeatableInputs
                  values={mustSpots}
                  onChange={setMustSpots}
                  placeholder="例）清水寺"
                  addLabel="MUSTを追加する"
                  max={MAX_ITEMS}
                />
              </div>
              <div className="field">
                <span className="field__label">WANT</span>
                <p className="field__hint">行けたら行きたい場所</p>
                <RepeatableInputs
                  values={wantSpots}
                  onChange={setWantSpots}
                  placeholder="例）錦市場"
                  addLabel="WANTを追加する"
                  max={MAX_ITEMS}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="join-spot-notes">
                  自由記述
                </label>
                <p className="field__hint">場所が決まっていない希望や、いきたいところについてのメモ。</p>
                <textarea
                  id="join-spot-notes"
                  className="input textarea"
                  value={spotNotes}
                  maxLength={1000}
                  placeholder="例）どこかで抹茶スイーツを食べたい"
                  onChange={(event) => setSpotNotes(event.target.value)}
                />
              </div>
              {info.spot_suggest_enabled && (
                <SpotSuggestions
                  theme={info.theme}
                  destination={info.destination}
                  lodgings={info.lodging_items}
                  dateFrom={info.date_from}
                  dateTo={info.date_to}
                  added={{ must: filledSpots(mustSpots), want: filledSpots(wantSpots) }}
                  onAdd={addSpot}
                />
              )}
            </section>

            <section className="card">
              <h2 className="card__title">予定</h2>
              <div className="field">
                <span className="field__label">予約済みの予定</span>
                <p className="field__hint">新幹線・飛行機・お店の予約など、時間が決まっている予定（日付・時刻は任意）。</p>
                <ConstraintInputs
                  values={constraints}
                  onChange={setConstraints}
                  minDate={info.date_from}
                  maxDate={info.date_to}
                  max={MAX_ITEMS}
                />
              </div>
              {roughPlans.length > 0 && (
                <div className="field">
                  <span className="field__label">ざっくり決まっている予定</span>
                  <p className="field__hint">「〇〇したい」くらいのラフな予定があれば、日ごとに書いてください。</p>
                  <div className="lodging-list">
                    {roughPlans.map((plan, index) => (
                      <div className="lodging-list__row" key={index}>
                        <div className="lodging-list__head">
                          <span className="lodging-list__label">{index + 1}日目</span>
                        </div>
                        <textarea
                          className="input textarea"
                          value={plan}
                          placeholder="例）夜は温泉でゆっくりしたい"
                          onChange={(event) => {
                            const next = [...roughPlans]
                            next[index] = event.target.value
                            setRoughPlans(next)
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="field">
                <label className="field__label" htmlFor="join-notes">
                  考慮事項・備考
                </label>
                <p className="field__hint">スケジュール感、NG項目、配慮事項など考慮事項</p>
                <textarea
                  id="join-notes"
                  className="input textarea"
                  value={notes}
                  maxLength={1000}
                  placeholder="例）朝早いのは苦手／甲殻類アレルギーがあります"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </section>

            <p className="field__hint">送信した内容はあとから編集できません。取り込むかどうかは幹事さんが決めます。</p>
            <div className="form__actions">
              <button type="submit" className="button button--primary" disabled={sending}>
                {sending ? '送信中...' : '送信する'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
