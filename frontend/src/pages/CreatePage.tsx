import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import ChoiceField from '../components/ChoiceField'
import ConstraintInputs from '../components/ConstraintInputs'
import ContributionPanel from '../components/ContributionPanel'
import ErrorPanel from '../components/ErrorPanel'
import JoinLinkModal from '../components/JoinLinkModal'
import LodgingInputs from '../components/LodgingInputs'
import RepeatableInputs from '../components/RepeatableInputs'
import SpotSuggestions from '../components/SpotSuggestions'
import TripSummaryCard from '../components/TripSummaryCard'
import { AppError, BusinessError, api } from '../lib/api'
import { nightsBetween } from '../lib/format'
import {
  clearDraft,
  getDeviceKey,
  getEditingTripId,
  loadDraft,
  saveDraft,
  startEditing,
  stopEditing,
} from '../lib/storage'
import {
  emptyLodging,
  emptyTripForm,
  type Contribution,
  type FieldError,
  type Options,
  type TripForm,
} from '../lib/types'

// 序盤の入力の負担感を減らすため、1ページの入力量を絞って5ステップに分けている。
// 最後のステップのあとに「入力内容の確認」ページ（CONFIRM_STEP）がある。
const STEP_LABELS = ['旅の基本', '宿泊先', 'いきたいところ（場所）', '予定', '出力設定']
const LAST_INPUT_STEP = STEP_LABELS.length - 1
const CONFIRM_STEP = STEP_LABELS.length

// サーバーから返るビジネスエラーのfield名から、それが属するステップを引く。
// エラーが出たとき、該当ステップまで自動で戻すために使う。
const FIELD_STEP: Record<string, number> = {
  title: 0,
  theme: 0,
  destination: 0,
  date_from: 0,
  date_to: 0,
  lodgings: 1,
  must_spots: 2,
  want_spots: 2,
  spot_notes: 2,
  rough_plans: 3,
  constraints: 3,
  free_notes: 3,
  image_mood: 4,
  aspect_ratio: 4,
  aspect_ratio_other: 4,
}

const filled = (values: string[]) => values.map((value) => value.trim()).filter(Boolean)

// 参加者の自由記述を取り込むとき、既存の文章の下に1行足す。
const appendText = (current: string, text: string) => (current.trim() ? `${current.trim()}\n${text}` : text)

// 画像のテーマの選択肢。選ぶと自由入力欄にその文言が入る（自由入力もそのまま使える）。
const IMAGE_MOODS = ['水彩・手描き風', 'レトロなポスター風', 'ポップでカラフル', 'シンプル・ミニマル', '写真風・リアル']

export default function CreatePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<TripForm>(() => loadDraft())
  const [editingTripId, setEditingTripId] = useState<string | null>(() => getEditingTripId())
  const [options, setOptions] = useState<Options | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [businessErrors, setBusinessErrors] = useState<FieldError[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [overwriting, setOverwriting] = useState(false)
  const [step, setStep] = useState(0)
  // 行先との整合性チェックで気になる点が出た場合、ユーザーが確認したものだけ true になる。
  const [consistencyWarnings, setConsistencyWarnings] = useState<string[]>([])
  const [confirmedWarnings, setConfirmedWarnings] = useState<Record<number, boolean>>({})
  // 意見募集リンク（ポップアップ）と、参加者から届いた追記
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinUrl, setJoinUrl] = useState('')
  const [joinSavedTripId, setJoinSavedTripId] = useState<string | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [contributions, setContributions] = useState<Contribution[]>([])
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

  // 保存済みの旅を編集中なら、参加者からの追記を読み込む（STEP3・4を開くたびに最新化）。
  const loadContributions = useCallback(async () => {
    if (!editingTripId) {
      setContributions([])
      return
    }
    try {
      setContributions((await api.contributions(editingTripId)).results)
    } catch {
      // 追記の表示は補助機能。読み込めなくても入力は続けられる。
    }
  }, [editingTripId])

  useEffect(() => {
    if (step === 2 || step === 3) void loadContributions()
  }, [step, loadContributions])

  const update = <K extends keyof TripForm>(key: K, value: TripForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    // 内容が変わったら、それまでの整合性チェック結果は古くなるのでクリアする。
    setConsistencyWarnings([])
    setConfirmedWarnings({})
  }

  // AI候補・参加者の意見から、MUST/WANTに場所を追加する（重複は追加しない）。
  const addSpot = (field: 'must_spots' | 'want_spots', name: string) => {
    const current = filled(form[field])
    if (current.includes(name) || current.length >= (options?.max_list_items ?? 20)) return
    update(field, [...current, name])
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
    setStep((current) => Math.min(current + 1, LAST_INPUT_STEP))
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
      const steps = error.errors.map((e) => FIELD_STEP[e.field] ?? LAST_INPUT_STEP)
      setStep(Math.min(...steps, LAST_INPUT_STEP))
      scrollToTop()
    } else if (error instanceof AppError) {
      setAppError(error.message)
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      setAppError('予期しないエラーが発生しました。時間をおいて再度お試しください。')
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // STEP5の次：サーバーで入力チェックと行先の整合性チェックをしてから確認ページへ。
  const goConfirm = async () => {
    setChecking(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      const result = await api.validateTrip(form)
      setConsistencyWarnings(result.consistency_warnings)
      setConfirmedWarnings({})
      setStep(CONFIRM_STEP)
      scrollToTop()
    } catch (error) {
      showErrors(error)
    } finally {
      setChecking(false)
    }
  }

  // 意見募集リンクを開く。新規作成中なら、リンクを発行するためにここまでの入力を一度保存する。
  const openJoinLink = async () => {
    // ポップアップは先に開き、リンクの準備中はスピナーを出す。
    setJoinOpen(true)
    setJoinUrl('')
    setJoinLoading(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      let tripId = editingTripId
      let savedNow: string | null = null
      if (!tripId) {
        const trip = await api.createTrip(form, getDeviceKey())
        tripId = trip.trip_id
        savedNow = trip.trip_id
        startEditing(tripId)
        setEditingTripId(tripId)
      }
      const { join_key } = await api.joinKey(tripId)
      setJoinSavedTripId(savedNow)
      setJoinUrl(`${window.location.origin}/join/${join_key}`)
    } catch (error) {
      setJoinOpen(false)
      showErrors(error)
    } finally {
      setJoinLoading(false)
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
    setContributions([])
    setConsistencyWarnings([])
    setConfirmedWarnings({})
    setStep(0)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    // 確認ページ以外でEnterキー等によりsubmitされた場合は、次へ進むだけにする。
    if (step < LAST_INPUT_STEP) {
      goNext()
      return
    }
    if (step === LAST_INPUT_STEP) {
      await goConfirm()
      return
    }
    setSubmitting(true)
    setBusinessErrors([])
    setAppError(null)
    try {
      await save()
    } catch (error) {
      showErrors(error)
    } finally {
      setSubmitting(false)
    }
  }

  const allWarningsConfirmed = consistencyWarnings.every((_, index) => confirmedWarnings[index])

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
  const isConfirm = step === CONFIRM_STEP

  return (
    <div className="page">
      <h1 className="page__title">プロンプト作成</h1>
      <p className="page__lead">
        分かるところだけでも大丈夫です。空欄は「未定」「おまかせ」としてプロンプトに反映されます。
      </p>

      {editingTripId && (
        <div className="notice notice--editing">
          <span>
            旅ID <strong>{editingTripId}</strong> を編集中です。保存すると元のプロンプトが上書きされます。
          </span>
          <button type="button" className="field-shortcut" onClick={cancelEditing}>
            編集をやめて新規作成する
          </button>
        </div>
      )}

      <div className="step-indicator">
        <p className="step-indicator__label">
          {isConfirm ? '入力内容の確認' : `STEP ${step + 1} / ${STEP_LABELS.length}　${STEP_LABELS[step]}`}
        </p>
        <div className="step-indicator__bar">
          <div
            className="step-indicator__fill"
            style={{ width: `${(isConfirm ? 1 : (step + 1) / (STEP_LABELS.length + 1)) * 100}%` }}
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
        )}

        {step === 1 && (
          <section className="card">
            <h2 className="card__title">宿泊先</h2>
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
          <section className="card">
            <div className="card__header">
              <h2 className="card__title">いきたいところ（場所）</h2>
              <div className="card__header-actions">
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => void openJoinLink()}
                  disabled={joinLoading}
                >
                  意見を集める
                </button>
              </div>
            </div>

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

            <div className="field">
              <label className="field__label" htmlFor="spot-notes">
                自由記述
              </label>
              <p className="field__hint">場所が決まっていない希望や、いきたいところについてのメモ。</p>
              <textarea
                id="spot-notes"
                className="input textarea"
                value={form.spot_notes}
                placeholder="例）どこかで抹茶スイーツを食べたい／夜景が見える場所に行きたい"
                onChange={(event) => update('spot_notes', event.target.value)}
              />
            </div>

            <ContributionPanel
              kind="spots"
              contributions={contributions}
              must={filled(form.must_spots)}
              want={filled(form.want_spots)}
              spotNotes={form.spot_notes}
              onAdoptSpotNotes={(text) => update('spot_notes', appendText(form.spot_notes, text))}
              onAdopt={addSpot}
            />

            {options.spot_suggest_enabled && (
              <SpotSuggestions
                theme={form.theme}
                destination={form.destination}
                lodgings={form.lodgings}
                dateFrom={form.date_from}
                dateTo={form.date_to}
                added={{ must: filled(form.must_spots), want: filled(form.want_spots) }}
                onAdd={addSpot}
              />
            )}
          </section>
        )}

        {step === 3 && (
          <section className="card">
            <h2 className="card__title">予定</h2>

            <div className="field">
              <span className="field__label">予約済みの予定</span>
              <p className="field__hint">
                新幹線・飛行機・お店の予約など、時間が決まっている予定を入れてください（日付・時刻は任意）。
              </p>
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

            <ContributionPanel
              kind="plans"
              contributions={contributions}
              constraints={form.constraints}
              roughPlans={form.rough_plans}
              notes={form.free_notes}
              onAdoptNotes={(text) => update('free_notes', appendText(form.free_notes, text))}
              onAdoptConstraint={(row) => update('constraints', [...form.constraints, row])}
              onAdoptRoughPlan={(index, text) => {
                const next = [...form.rough_plans]
                next[index] = next[index].trim() ? `${next[index].trim()}／${text}` : text
                update('rough_plans', next)
              }}
            />

            <div className="field">
              <label className="field__label" htmlFor="free-notes">
                考慮事項・備考
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
        )}

        {step === 4 && (
          <section className="card">
            <h2 className="card__title">出力設定</h2>
            <p className="field__hint">旅の行程表プロンプトは必ず出力されます。しおりの表紙画像も作りたい場合はチェックしてください。</p>
            <label className="consistency-check__item">
              <input
                type="checkbox"
                checked={form.image_enabled}
                onChange={(event) => update('image_enabled', event.target.checked)}
              />
              <span>画像生成用プロンプトも出力する</span>
            </label>

            {form.image_enabled && (
              <div className="output-settings__image">
                <div className="field">
                  <label className="field__label" htmlFor="image-mood">
                    画像のテーマ
                  </label>
                  <p className="field__hint">画像の雰囲気。選択肢から選ぶか、自由に入力してください。空欄ならおまかせになります。</p>
                  <div className="choice-chips" role="radiogroup" aria-label="画像のテーマ">
                    {IMAGE_MOODS.map((mood) => (
                      <button
                        key={mood}
                        type="button"
                        role="radio"
                        aria-checked={form.image_mood === mood}
                        className={form.image_mood === mood ? 'chip chip--selected' : 'chip'}
                        onClick={() => update('image_mood', form.image_mood === mood ? '' : mood)}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                  <input
                    id="image-mood"
                    type="text"
                    className="input"
                    value={form.image_mood}
                    placeholder="例）和モダン、北欧風のイラスト"
                    onChange={(event) => update('image_mood', event.target.value)}
                  />
                </div>

                <ChoiceField
                  label="画像サイズ"
                  choices={options.aspect_ratios}
                  value={form.aspect_ratio}
                  onChange={(value) => update('aspect_ratio', value)}
                  otherValue={options.other_value}
                  otherText={form.aspect_ratio_other}
                  onOtherTextChange={(value) => update('aspect_ratio_other', value)}
                />
              </div>
            )}
          </section>
        )}

        {step === CONFIRM_STEP && (
          <>
            <TripSummaryCard form={form} options={options} />

            {consistencyWarnings.length > 0 && (
              <section className="card consistency-check">
                <h2 className="card__title">行先との整合性を確認してください</h2>
                <p className="field__hint">
                  AIによる自動チェックです。誤検知の可能性もあるので、内容を見て問題なければチェックしてから出力してください。
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
              </section>
            )}
          </>
        )}

        <div className={step > 0 || editingTripId ? 'form__actions form__actions--multi' : 'form__actions'}>
          {step > 0 && (
            <button type="button" className="button button--ghost" onClick={goPrev}>
              戻る
            </button>
          )}
          {step < CONFIRM_STEP ? (
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
              {step < LAST_INPUT_STEP ? (
                <button type="button" className="button button--primary" onClick={goNext}>
                  次へ
                </button>
              ) : (
                <button type="button" className="button button--primary" onClick={() => void goConfirm()} disabled={checking}>
                  {checking ? '確認中...' : '入力内容を確認する'}
                </button>
              )}
            </>
          ) : (
            <button
              type="submit"
              className="button button--primary"
              disabled={submitting || (consistencyWarnings.length > 0 && !allWarningsConfirmed)}
            >
              {submitting ? (editingTripId ? '更新中...' : '出力中...') : editingTripId ? '更新して出力する' : '出力する'}
            </button>
          )}
        </div>
      </form>

      {joinOpen && (
        <JoinLinkModal
          url={joinUrl}
          loading={joinLoading}
          savedTripId={joinSavedTripId}
          onClose={() => setJoinOpen(false)}
        />
      )}
    </div>
  )
}
