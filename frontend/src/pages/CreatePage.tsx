import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import ChoiceField from '../components/ChoiceField'
import MultiChoiceField from '../components/MultiChoiceField'
import ConstraintInputs from '../components/ConstraintInputs'
import ErrorPanel from '../components/ErrorPanel'
import RepeatableInputs from '../components/RepeatableInputs'
import AddressInput from '../components/AddressInput'
import { AppError, BusinessError, api } from '../lib/api'
import { nightsBetween } from '../lib/format'
import { clearDraft, getDeviceKey, getEditingTripId, loadDraft, saveDraft, stopEditing } from '../lib/storage'
import { emptyTripForm, type FieldError, type Options, type TripForm } from '../lib/types'

// 一度に入力する量を減らすため、フォームをステップに分けている。
const STEP_LABELS = ['旅の基本', '集合・解散・宿泊', 'いきたいスポット', '条件', 'しおりのデザイン指示']
const LAST_STEP = STEP_LABELS.length - 1

// サーバーから返るビジネスエラーのfield名から、それが属するステップを引く。
// エラーが出たとき、該当ステップまで自動で戻すために使う。
const FIELD_STEP: Record<string, number> = {
  title: 0,
  theme: 0,
  destination: 0,
  date_from: 0,
  date_to: 0,
  meeting_place: 1,
  dismissal_place: 1,
  lodgings: 1,
  must_spots: 2,
  want_spots: 2,
  schedule_paces: 3,
  schedule_pace_other: 3,
  rough_plans: 3,
  constraints: 3,
  ng_items: 3,
  notes: 3,
  free_notes: 3,
  design_taste: 4,
  design_taste_other: 4,
  color_image: 4,
  color_image_other: 4,
  aspect_ratio: 4,
  aspect_ratio_other: 4,
}

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

  // 入力内容は都度下書き保存する（確認ページへの受け渡しと、戻ったときの復元用）。
  useEffect(() => {
    saveDraft(form)
  }, [form])

  // 宿泊場所は泊数（日帰りなら0件）、ざっくり決まっている予定は日数（期間未入力なら0件）に
  // 合わせて入力欄を増減させる。
  useEffect(() => {
    const resize = (list: string[], count: number) => {
      if (list.length === count) return list
      const next = list.slice(0, count)
      while (next.length < count) next.push('')
      return next
    }
    setForm((current) => {
      const lodgings = resize(current.lodgings, nights)
      const roughPlans = resize(current.rough_plans, days)
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

  const proceedToConfirm = () => {
    saveDraft(form)
    navigate('/confirm')
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

  // 編集中、途中のステップまでしか直さない場合に「上書き」でそのまま保存する。
  // （元データを丸ごと読み込んでいるので、他の項目は既存の値のまま更新される）
  const handleOverwrite = async () => {
    if (!editingTripId) return
    setOverwriting(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      const trip = await api.updateTrip(editingTripId, form, getDeviceKey())
      clearDraft()
      stopEditing()
      navigate(`/trip/${trip.trip_id}`)
    } catch (error) {
      if (error instanceof BusinessError) {
        setBusinessErrors(error.errors)
        const steps = error.errors.map((e) => FIELD_STEP[e.field] ?? LAST_STEP)
        setStep(Math.min(...steps, LAST_STEP))
        scrollToTop()
      } else if (error instanceof AppError) {
        setAppError(error.message)
      } else {
        setAppError('予期しないエラーが発生しました。')
      }
    } finally {
      setOverwriting(false)
    }
  }

  const cancelEditing = () => {
    stopEditing()
    clearDraft()
    setEditingTripId(null)
    setForm(emptyTripForm())
    setConsistencyWarnings([])
    setConfirmedWarnings({})
    setStep(0)
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
      // 確認ページへ進む前に、サーバー側でビジネスエラーの確認と行先の整合性チェックを行う。
      const result = await api.validateTrip(form)
      if (result.consistency_warnings.length > 0) {
        setConsistencyWarnings(result.consistency_warnings)
        setConfirmedWarnings({})
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        proceedToConfirm()
      }
    } catch (error) {
      if (error instanceof BusinessError) {
        setBusinessErrors(error.errors)
        // エラーが出た項目のうち、一番手前のステップまで戻して見つけやすくする。
        const steps = error.errors.map((e) => FIELD_STEP[e.field] ?? LAST_STEP)
        setStep(Math.min(...steps, LAST_STEP))
        scrollToTop()
      } else if (error instanceof AppError) {
        setAppError(error.message)
      } else {
        setAppError('予期しないエラーが発生しました。時間をおいて再度お試しください。')
      }
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

  return (
    <div className="page">
      <h1 className="page__title">プロンプト作成</h1>
      <p className="page__lead">
        分かるところだけでも大丈夫です。空欄は「未定」としてプロンプトに反映されます。
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
          <div
            className="step-indicator__fill"
            style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
          />
        </div>
      </div>

      <div ref={errorRef}>
        <ErrorPanel businessErrors={businessErrors} appError={appError} />
      </div>

      <form className="form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
        {step === 0 && (
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
            <p className="field__hint">旅のコンセプトがあれば書いてください。</p>
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
              期間<span className="field__required">必須</span>
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
            {form.date_from && form.date_to && (
              <p className="field__hint field__hint--accent">
                {isDayTrip ? '日帰りの旅程です。' : `${nights}泊${nights + 1}日の旅程です。`}
              </p>
            )}
          </div>
        </section>
        )}

        {step === 1 && (
        <section className="card">
          <h2 className="card__title">集合・解散・宿泊</h2>

          <div className="field">
            <label className="field__label" htmlFor="meeting-place">
              集合場所<span className="field__required">必須</span>
            </label>
            <AddressInput
              id="meeting-place"
              value={form.meeting_place}
              onChange={(value) => update('meeting_place', value)}
              placeholder="例）京都駅 中央改札前"
              suggestEnabled={suggestEnabled}
            />
          </div>

          <div className="field">
            <div className="field__label-row">
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
          </div>

          <div className="field">
            <span className="field__label">宿泊場所</span>
            <p className="field__hint">
              {isDayTrip
                ? '日帰りのため入力できません。期間を入力すると泊数ぶんの欄が出ます。'
                : `未定なら空欄のままでも進めます。`}
            </p>
            {isDayTrip ? (
              <input className="input" type="text" value="" disabled placeholder="日帰り" />
            ) : (
              <div className="lodging-list">
                {form.lodgings.map((lodging, index) => {
                  const previous = index > 0 ? form.lodgings[index - 1] : ''
                  const showSame = index > 0 && previous.trim() && !lodging.trim()
                  const setLodging = (value: string) => {
                    const next = [...form.lodgings]
                    next[index] = value
                    update('lodgings', next)
                  }
                  return (
                    <div className="lodging-list__row" key={index}>
                      <div className="lodging-list__head">
                        <span className="lodging-list__label">{index + 1}泊目</span>
                        {showSame && (
                          <button type="button" className="field-shortcut" onClick={() => setLodging(previous)}>
                            {index}泊目と同じ
                          </button>
                        )}
                        <button type="button" className="field-shortcut" onClick={() => setLodging('未定')}>
                          考えない
                        </button>
                        <button type="button" className="field-shortcut" onClick={() => setLodging('おまかせ')}>
                          おまかせ
                        </button>
                      </div>
                      <AddressInput
                        value={lodging}
                        onChange={setLodging}
                        placeholder="例）〇〇ホテル 京都"
                        suggestEnabled={suggestEnabled}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
        )}

        {step === 2 && (
        <section className="card">
          <h2 className="card__title">いきたいスポット</h2>

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
        )}

        {step === 3 && (
        <section className="card">
          <h2 className="card__title">条件</h2>

          <MultiChoiceField
            label="スケジュール感"
            choices={options.schedule_paces}
            values={form.schedule_paces}
            onChange={(values) => update('schedule_paces', values)}
            otherValue={options.other_value}
            otherText={form.schedule_pace_other}
            onOtherTextChange={(value) => update('schedule_pace_other', value)}
            otherPlaceholder="例）夕方には毎日ホテルに戻りたい"
          />

          <div className="field">
            <span className="field__label">ざっくり決まっている予定</span>
            <p className="field__hint">
              {hasPeriod
                ? '「〇〇に行きたい」くらいのラフな予定があれば、日ごとに書いてください（空欄でも進めます）。'
                : '期間を入力すると日数ぶんの欄が出ます。'}
            </p>
            {hasPeriod && (
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
            )}
          </div>

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

          <div className="field">
            <span className="field__label">NG項目</span>
            <p className="field__hint">これは入れないでほしい、ということ。</p>
            <RepeatableInputs
              values={form.ng_items}
              onChange={(values) => update('ng_items', values)}
              placeholder="例）朝5時起きは無理"
              addLabel="NG項目を追加する"
              max={options.max_list_items}
            />
          </div>

          <div className="field">
            <span className="field__label">配慮・共有メモ</span>
            <p className="field__hint">アレルギー、体力、予算感など、共有しておきたいこと。</p>
            <RepeatableInputs
              values={form.notes}
              onChange={(values) => update('notes', values)}
              placeholder="例）Aさんは甲殻類アレルギー"
              addLabel="メモを追加する"
              max={options.max_list_items}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="free-notes">
              自由入力欄
            </label>
            <p className="field__hint">上の項目にうまく当てはまらない条件があれば、自由に書いてください。</p>
            <textarea
              id="free-notes"
              className="input textarea"
              value={form.free_notes}
              placeholder="例）雨天時は屋内中心にしたい"
              onChange={(event) => update('free_notes', event.target.value)}
            />
          </div>
        </section>
        )}

        {step === 4 && (
        <>
        <section className="card">
          <h2 className="card__title">しおりのデザイン指示</h2>

          <ChoiceField
            label="デザインテイスト"
            required
            choices={options.design_tastes}
            value={form.design_taste}
            onChange={(value) => update('design_taste', value)}
            otherValue={options.other_value}
            otherText={form.design_taste_other}
            onOtherTextChange={(value) => update('design_taste_other', value)}
          />

          <ChoiceField
            label="全体のカラーイメージ"
            required
            choices={options.color_images}
            value={form.color_image}
            onChange={(value) => update('color_image', value)}
            otherValue={options.other_value}
            otherText={form.color_image_other}
            onOtherTextChange={(value) => update('color_image_other', value)}
          />

          <ChoiceField
            label="出力サイズ（アスペクト比）"
            required
            choices={options.aspect_ratios}
            value={form.aspect_ratio}
            onChange={(value) => update('aspect_ratio', value)}
            otherValue={options.other_value}
            otherText={form.aspect_ratio_other}
            onOtherTextChange={(value) => update('aspect_ratio_other', value)}
          />
        </section>

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
              disabled={!allWarningsConfirmed}
              onClick={proceedToConfirm}
            >
              確認して進む
            </button>
          </section>
        )}
        </>
        )}

        <div
          className={
            step > 0 || (editingTripId && step < LAST_STEP)
              ? 'form__actions form__actions--multi'
              : 'form__actions'
          }
        >
          {step > 0 && (
            <button type="button" className="button button--ghost" onClick={goPrev}>
              戻る
            </button>
          )}
          {step < LAST_STEP ? (
            <>
              <button type="button" className="button button--primary" onClick={goNext}>
                次へ
              </button>
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
            </>
          ) : (
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? '確認中...' : '入力内容を確認する'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
