import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import AddressInput from '../components/AddressInput'
import ChoiceField from '../components/ChoiceField'
import ConstraintInputs from '../components/ConstraintInputs'
import ErrorPanel from '../components/ErrorPanel'
import LodgingInputs from '../components/LodgingInputs'
import RepeatableInputs from '../components/RepeatableInputs'
import TripSummaryCard from '../components/TripSummaryCard'
import { AppError, BusinessError, api } from '../lib/api'
import { nightsBetween } from '../lib/format'
import { clearDraft, getDeviceKey, getEditingTripId, loadDraft, saveDraft, stopEditing } from '../lib/storage'
import { emptyLodging, emptyTripForm, type FieldError, type Options, type TripForm } from '../lib/types'

// 一度に入力する量を減らすため、フォームを4ステップに分けている。
const STEP_LABELS = ['旅の基本と往路・復路', '滞在場所決め', 'いきたいところ・条件', '最終調整と出力']
const LAST_STEP = STEP_LABELS.length - 1

// サーバーから返るビジネスエラーのfield名から、それが属するステップを引く。
// エラーが出たとき、該当ステップまで自動で戻すために使う。
const FIELD_STEP: Record<string, number> = {
  title: 0,
  theme: 0,
  destination: 0,
  date_from: 0,
  date_to: 0,
  outbound_transport: 0,
  outbound_transport_other: 0,
  outbound_reservation: 0,
  return_transport: 0,
  return_transport_other: 0,
  return_reservation: 0,
  meeting_place: 0,
  dismissal_place: 0,
  lodgings: 1,
  must_spots: 2,
  want_spots: 2,
  schedule_paces: 2,
  schedule_pace_other: 2,
  rough_plans: 2,
  constraints: 2,
  ng_items: 2,
  notes: 2,
  free_notes: 2,
  design_taste: 3,
  design_taste_other: 3,
  color_image: 3,
  color_image_other: 3,
  aspect_ratio: 3,
  aspect_ratio_other: 3,
}

// 予約状況には「その他」が無いので、ChoiceField の otherValue に絶対に一致しない値を渡す。
const NO_OTHER = '__none__'

export default function CreatePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<TripForm>(() => loadDraft())
  const [editingTripId, setEditingTripId] = useState<string | null>(() => getEditingTripId())
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [businessErrors, setBusinessErrors] = useState<FieldError[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [overwriting, setOverwriting] = useState(false)
  const [step, setStep] = useState(0)
  // 行先との整合性チェックで気になる点が出た場合、ユーザーが確認したものだけ true になる。
  const [consistencyWarnings, setConsistencyWarnings] = useState<string[]>([])
  const [confirmedWarnings, setConfirmedWarnings] = useState<Record<number, boolean>>({})
  const [showPlaces, setShowPlaces] = useState(() => Boolean(form.meeting_place || form.dismissal_place))
  const errorRef = useRef<HTMLDivElement>(null)

  const nights = useMemo(() => nightsBetween(form.date_from, form.date_to), [form.date_from, form.date_to])
  const isDayTrip = nights === 0
  // 期間が入力されていれば1日以上。未入力（nights=0扱い）のときは、日数ベースの欄をまだ出さない。
  const hasPeriod = Boolean(form.date_from && form.date_to)
  const days = hasPeriod ? nights + 1 : 0

  const loadOptions = async () => {
    setLoadError(null)
    try {
      setOptions(await api.options())
    } catch (error) {
      setLoadError(error instanceof AppError ? error.message : '選択肢の読み込みに失敗しました。')
    }
  }

  useEffect(() => {
    void loadOptions()
  }, [])

  // 入力内容は都度下書き保存する（リロードしたときの復元用）。
  useEffect(() => {
    saveDraft(form)
  }, [form])

  // 宿泊先は泊数（日帰りなら0件）、ざっくり決まっている予定は日数（期間未入力なら0件）に
  // 合わせて入力欄を増減させる。
  useEffect(() => {
    setForm((current) => {
      let lodgings = current.lodgings
      if (lodgings.length !== nights) {
        lodgings = lodgings.slice(0, nights)
        while (lodgings.length < nights) lodgings.push(emptyLodging())
      }
      let roughPlans = current.rough_plans
      if (roughPlans.length !== days) {
        roughPlans = roughPlans.slice(0, days)
        while (roughPlans.length < days) roughPlans.push('')
      }
      if (lodgings === current.lodgings && roughPlans === current.rough_plans) return current
      return { ...current, lodgings, rough_plans: roughPlans }
    })
  }, [nights, days])

  const update = <K extends keyof TripForm>(key: K, value: TripForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    // 内容が変わったら、それまでの整合性チェック結果は古くなるのでクリアする。
    setConsistencyWarnings([])
    setConfirmedWarnings({})
  }

  // Enterキーでの意図しないフォーム送信を防ぐ（textareaや、ボタン自体でのEnterは許可する）。
  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return
    event.preventDefault()
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const goNext = () => {
    setStep((current) => Math.min(current + 1, LAST_STEP))
    scrollToTop()
  }

  const goPrev = () => {
    setStep((current) => Math.max(current - 1, 0))
    scrollToTop()
  }

  // ビジネスエラーを表示し、エラーのある一番手前のステップまで戻す。
  const showErrors = (error: unknown) => {
    if (error instanceof BusinessError) {
      setBusinessErrors(error.errors)
      const steps = error.errors.map((e) => FIELD_STEP[e.field] ?? LAST_STEP)
      setStep(Math.min(...steps, LAST_STEP))
      scrollToTop()
    } else if (error instanceof AppError) {
      setAppError(error.message)
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      setAppError('予期しないエラーが発生しました。時間をおいて再度お試しください。')
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // 保存（新規なら作成、再編集中なら同じ旅IDに上書き）して結果ページへ。
  const save = async () => {
    const trip = editingTripId
      ? await api.updateTrip(editingTripId, form, getDeviceKey())
      : await api.createTrip(form, getDeviceKey())
    clearDraft()
    stopEditing()
    navigate(`/trip/${trip.trip_id}`)
  }

  // 編集中、途中のステップまでしか直さない場合に「上書き」でそのまま保存する。
  // （元データを丸ごと読み込んでいるので、他の項目は既存の値のまま更新される）
  const handleOverwrite = async () => {
    if (!editingTripId) return
    setOverwriting(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      await save()
    } catch (error) {
      showErrors(error)
    } finally {
      setOverwriting(false)
    }
  }

  const cancelEditing = () => {
    stopEditing()
    clearDraft()
    setEditingTripId(null)
    setForm(emptyTripForm())
    setShowPlaces(false)
    setConsistencyWarnings([])
    setConfirmedWarnings({})
    setStep(0)
  }

  // 整合性チェックの警告をすべて確認した後に、そのまま出力する。
  const outputAfterWarnings = async () => {
    setSubmitting(true)
    try {
      await save()
    } catch (error) {
      showErrors(error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    // 最後のステップ以外でEnterキー等によりsubmitされた場合は、次へ進むだけにする。
    if (step < LAST_STEP) {
      goNext()
      return
    }
    setSubmitting(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      // 出力前にサーバー側でビジネスエラーの確認と行先の整合性チェックを行う。
      const result = await api.validateTrip(form)
      if (result.consistency_warnings.length > 0) {
        setConsistencyWarnings(result.consistency_warnings)
        setConfirmedWarnings({})
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      await save()
    } catch (error) {
      showErrors(error)
    } finally {
      setSubmitting(false)
    }
  }

  const allWarningsConfirmed =
    consistencyWarnings.length > 0 && consistencyWarnings.every((_, index) => confirmedWarnings[index])

  if (loadError) {
    return (
      <div className="page">
        <ErrorPanel appError={loadError} onRetry={() => void loadOptions()} />
      </div>
    )
  }

  if (!options) {
    return (
      <div className="page">
        <p className="loading">読み込み中...</p>
      </div>
    )
  }

  const suggestEnabled = options.place_suggest_enabled

  const transportFields = (prefix: 'outbound' | 'return', label: string, hint: string) => (
    <div className="transport-block">
      <h3 className="card__subtitle">{label}</h3>
      <ChoiceField
        label="交通手段"
        required
        hint={hint}
        choices={options.transports}
        value={form[`${prefix}_transport`]}
        onChange={(value) => update(`${prefix}_transport`, value)}
        otherValue={options.other_value}
        otherText={form[`${prefix}_transport_other`]}
        onOtherTextChange={(value) => update(`${prefix}_transport_other`, value)}
        otherPlaceholder="例）夜行フェリー、レンタカー"
      />
      <ChoiceField
        label="予約状況"
        required
        choices={options.reservation_statuses}
        value={form[`${prefix}_reservation`]}
        onChange={(value) => update(`${prefix}_reservation`, value)}
        otherValue={NO_OTHER}
        otherText=""
        onOtherTextChange={() => undefined}
      />
    </div>
  )

  return (
    <div className="page">
      <h1 className="page__title">プロンプト作成</h1>
      <p className="page__lead">
        分かるところだけでも大丈夫です。空欄は「未定」「おまかせ」としてプロンプトに反映されます。
      </p>

      {editingTripId && (
        <div className="notice notice--editing">
          <span>
            旅ID <strong>{editingTripId}</strong> を再編集中です。保存すると元のプロンプトが上書きされます。
          </span>
          <button type="button" className="field-shortcut" onClick={cancelEditing}>
            編集をやめて新規作成する
          </button>
        </div>
      )}

      <div className="step-indicator">
        <p className="step-indicator__label">
          STEP {step + 1} / {STEP_LABELS.length}　{STEP_LABELS[step]}
        </p>
        <div className="step-indicator__bar">
          <div className="step-indicator__fill" style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }} />
        </div>
      </div>

      <div ref={errorRef}>
        <ErrorPanel businessErrors={businessErrors} appError={appError} />
      </div>

      <form className="form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
        {step === 0 && (
          <>
            <section className="card">
              <h2 className="card__title">旅の基本</h2>

              <div className="field">
                <label className="field__label" htmlFor="title">
                  タイトル<span className="field__required">必須</span>
                </label>
                <input
                  id="title"
                  type="text"
                  className="input"
                  value={form.title}
                  placeholder="例）秋の京都ふたり旅"
                  onChange={(event) => update('title', event.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="theme">
                  テーマ
                </label>
                <input
                  id="theme"
                  type="text"
                  className="input"
                  value={form.theme}
                  placeholder="例）紅葉と甘いものを楽しむ"
                  onChange={(event) => update('theme', event.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="destination">
                  行先
                </label>
                <p className="field__hint">おおまかな方面で構いません。宿泊場所やスポットとの整合性チェックに使います。</p>
                <input
                  id="destination"
                  type="text"
                  className="input"
                  value={form.destination}
                  placeholder="例）京都・関西方面"
                  onChange={(event) => update('destination', event.target.value)}
                />
              </div>

              <div className="field">
                <span className="field__label">
                  日程<span className="field__required">必須</span>
                </span>
                <div className="date-grid">
                  <div className="date-grid__cell">
                    <label className="field__sublabel" htmlFor="date-from">
                      自
                    </label>
                    <input
                      id="date-from"
                      type="date"
                      className="input"
                      value={form.date_from}
                      onChange={(event) => {
                        const value = event.target.value
                        // 期間（至）が未入力なら、まず同日を仮でセットしておく（あとで自由に変更できる）。
                        setForm((current) => ({
                          ...current,
                          date_from: value,
                          date_to: current.date_to ? current.date_to : value,
                        }))
                      }}
                    />
                  </div>
                  <div className="date-grid__cell">
                    <label className="field__sublabel" htmlFor="date-to">
                      至
                    </label>
                    <input
                      id="date-to"
                      type="date"
                      className="input"
                      value={form.date_to}
                      min={form.date_from || undefined}
                      onChange={(event) => update('date_to', event.target.value)}
                    />
                  </div>
                </div>
                {hasPeriod && (
                  <p className="field__hint field__hint--accent">
                    {isDayTrip ? '日帰りの旅程です。' : `${nights}泊${nights + 1}日の旅程です。`}
                  </p>
                )}
              </div>
            </section>

            <section className="card">
              <h2 className="card__title">往路・復路の交通手段</h2>
              {transportFields('outbound', '往路（行き）', '出発するときの移動手段')}
              {transportFields('return', '復路（帰り）', '帰ってくるときの移動手段')}

              <div className="field">
                {showPlaces ? (
                  <>
                    <div className="field__label-row">
                      <label className="field__label" htmlFor="meeting-place">
                        集合場所
                      </label>
                      <span className="field__hint">任意</span>
                    </div>
                    <AddressInput
                      id="meeting-place"
                      value={form.meeting_place}
                      onChange={(value) => update('meeting_place', value)}
                      placeholder="例）京都駅 中央改札前"
                      suggestEnabled={suggestEnabled}
                    />
                    <div className="field__label-row places-dismissal">
                      <label className="field__label" htmlFor="dismissal-place">
                        解散場所
                      </label>
                      {form.meeting_place.trim() && !form.dismissal_place.trim() && (
                        <button
                          type="button"
                          className="field-shortcut"
                          onClick={() => update('dismissal_place', form.meeting_place)}
                        >
                          集合場所と同じ
                        </button>
                      )}
                    </div>
                    <AddressInput
                      id="dismissal-place"
                      value={form.dismissal_place}
                      onChange={(value) => update('dismissal_place', value)}
                      placeholder="例）京都駅 八条口"
                      suggestEnabled={suggestEnabled}
                    />
                  </>
                ) : (
                  <button type="button" className="add-button" onClick={() => setShowPlaces(true)}>
                    ＋ 集合・解散場所も指定する（任意）
                  </button>
                )}
              </div>
            </section>
          </>
        )}

        {step === 1 && (
          <section className="card">
            <h2 className="card__title">滞在場所決め</h2>
            <div className="field">
              <span className="field__label">
                宿泊先<span className="field__required">必須</span>
              </span>
              {!hasPeriod ? (
                <p className="field__hint">STEP1で日程を入力すると、泊数ぶんの欄が出ます。</p>
              ) : isDayTrip ? (
                <p className="field__hint">日帰りのため宿泊先の入力は不要です。そのまま次へ進んでください。</p>
              ) : (
                <>
                  <p className="field__hint">
                    泊ごとに「宿名（決まっている）」「検討エリア（場所だけ決めたい）」「おまかせ」から選んでください。
                  </p>
                  <LodgingInputs
                    lodgings={form.lodgings}
                    onChange={(lodgings) => update('lodgings', lodgings)}
                    modes={options.lodging_modes}
                    suggestEnabled={suggestEnabled}
                  />
                </>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <>
            <section className="card">
              <h2 className="card__title">いきたいところ</h2>

              <div className="field">
                <span className="field__label">MUST</span>
                <p className="field__hint">絶対に行きたい場所。必ず旅程に入れてもらいます。</p>
                <RepeatableInputs
                  values={form.must_spots}
                  onChange={(values) => update('must_spots', values)}
                  placeholder="例）清水寺"
                  asAddress
                  suggestEnabled={suggestEnabled}
                  addLabel="MUSTを追加する"
                  max={options.max_list_items}
                />
              </div>

              <div className="field">
                <span className="field__label">WANT</span>
                <p className="field__hint">行けたら行きたい場所。余裕があれば組み込んでもらいます。</p>
                <RepeatableInputs
                  values={form.want_spots}
                  onChange={(values) => update('want_spots', values)}
                  placeholder="例）錦市場"
                  asAddress
                  suggestEnabled={suggestEnabled}
                  addLabel="WANTを追加する"
                  max={options.max_list_items}
                />
              </div>
            </section>

            <section className="card">
              <h2 className="card__title">条件</h2>

              <div className="field">
                <span className="field__label">予約済みの予定</span>
                <p className="field__hint">時間が決まっている予定を入れてください（日付・時刻は任意）。</p>
                <ConstraintInputs
                  values={form.constraints}
                  onChange={(values) => update('constraints', values)}
                  minDate={form.date_from}
                  maxDate={form.date_to}
                  max={options.max_list_items}
                />
              </div>

              {hasPeriod && (
                <div className="field">
                  <span className="field__label">ざっくり決まっている予定</span>
                  <p className="field__hint">「〇〇に行きたい」くらいのラフな予定があれば、日ごとに書いてください。</p>
                  <div className="lodging-list">
                    {form.rough_plans.map((plan, index) => (
                      <div className="lodging-list__row" key={index}>
                        <div className="lodging-list__head">
                          <span className="lodging-list__label">{index + 1}日目</span>
                        </div>
                        <textarea
                          className="input textarea"
                          value={plan}
                          placeholder="例）午前中は観光、午後はカフェ巡りをのんびり"
                          onChange={(event) => {
                            const next = [...form.rough_plans]
                            next[index] = event.target.value
                            update('rough_plans', next)
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="field">
                <label className="field__label" htmlFor="free-notes">
                  自由入力欄
                </label>
                <p className="field__hint">スケジュール感、NG項目、配慮事項など考慮事項</p>
                <textarea
                  id="free-notes"
                  className="input textarea"
                  value={form.free_notes}
                  placeholder="例）休憩多めでゆったり回りたい／朝5時起きは無理／Aさんは甲殻類アレルギー"
                  onChange={(event) => update('free_notes', event.target.value)}
                />
              </div>
            </section>

            <section className="card">
              <h2 className="card__title">旅行意見聴取（任意）</h2>
              <p className="field__hint">
                ONにすると、出力後の結果ページに参加者向けの回答URLが表示されます。参加者はログインなしで「行きたい場所」「苦手なこと」などを送れます。
                届いた意見は結果ページで確認し、必要に応じて再編集で反映してください（自動では反映されません）。
              </p>
              <label className="consistency-check__item">
                <input
                  type="checkbox"
                  checked={form.collect_feedback}
                  onChange={(event) => update('collect_feedback', event.target.checked)}
                />
                <span>参加者に意見を聞く</span>
              </label>
            </section>
          </>
        )}

        {step === 3 && (
          <>
            <section className="card">
              <h2 className="card__title">出力サイズ（任意）</h2>
              <p className="field__hint">選ばなかった場合は「おまかせ」としてプロンプトに反映されます。</p>

              <ChoiceField
                label="出力サイズ（アスペクト比）"
                choices={options.aspect_ratios}
                value={form.aspect_ratio}
                onChange={(value) => update('aspect_ratio', value)}
                otherValue={options.other_value}
                otherText={form.aspect_ratio_other}
                onOtherTextChange={(value) => update('aspect_ratio_other', value)}
              />

              {form.aspect_ratio && (
                <button
                  type="button"
                  className="field-shortcut"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      aspect_ratio: '',
                      aspect_ratio_other: '',
                    }))
                  }}
                >
                  おまかせにする
                </button>
              )}
            </section>

            <TripSummaryCard form={form} options={options} />

            {consistencyWarnings.length > 0 && (
              <section className="card consistency-check">
                <h2 className="card__title">行先との整合性を確認してください</h2>
                <p className="field__hint">
                  AIによる自動チェックです。誤検知の可能性もあるので、内容を見て問題なければチェックしてください。
                </p>
                <ul className="consistency-check__list">
                  {consistencyWarnings.map((warning, index) => (
                    <li key={index}>
                      <label className="consistency-check__item">
                        <input
                          type="checkbox"
                          checked={Boolean(confirmedWarnings[index])}
                          onChange={(event) =>
                            setConfirmedWarnings((current) => ({ ...current, [index]: event.target.checked }))
                          }
                        />
                        <span>{warning}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!allWarningsConfirmed || submitting}
                  onClick={() => void outputAfterWarnings()}
                >
                  確認して出力する
                </button>
              </section>
            )}
          </>
        )}

        <div
          className={
            step > 0 || (editingTripId && step < LAST_STEP) ? 'form__actions form__actions--multi' : 'form__actions'
          }
        >
          {step > 0 && (
            <button type="button" className="button button--ghost" onClick={goPrev}>
              戻る
            </button>
          )}
          {step < LAST_STEP ? (
            <>
              {editingTripId && (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void handleOverwrite()}
                  disabled={overwriting}
                >
                  {overwriting ? '保存中...' : '上書き'}
                </button>
              )}
              <button type="button" className="button button--primary" onClick={goNext}>
                次へ
              </button>
            </>
          ) : (
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? (editingTripId ? '更新中...' : '出力中...') : editingTripId ? '更新して出力する' : '出力する'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
