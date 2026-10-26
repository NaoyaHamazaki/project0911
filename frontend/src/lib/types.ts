export type Choice = { value: string; label: string }

export type Options = {
  /** 管理者が Setting テーブルで設定するお知らせ。空文字なら非表示。 */
  notice: string
  /** 要望フォームの受付可否 */
  feature_request_open: boolean
  schedule_paces: Choice[]
  design_tastes: Choice[]
  color_images: Choice[]
  aspect_ratios: Choice[]
  transports: Choice[]
  reservation_statuses: Choice[]
  lodging_modes: Choice[]
  feature_request_categories: Choice[]
  other_value: string
  max_trip_days: number
  max_list_items: number
  place_suggest_enabled: boolean
  /** いきたいスポットのAI候補（Gemini）が使えるか */
  spot_suggest_enabled: boolean
  /** 管理者用プロンプト編集画面(/admin-settings)を出すかどうか。本番では基本false。 */
  admin_menu_enabled: boolean
}

export type PromptSettingItem = {
  key: string
  label: string
  value: string
  default: string
}

export type Constraint = {
  date: string
  time: string
  content: string
}

/** 宿泊先（泊ごと）。mode が空なら未選択。 */
export type LodgingMode = '' | 'name' | 'area' | 'omakase'
export type Lodging = { mode: LodgingMode; value: string }

export const emptyLodging = (): Lodging => ({ mode: '', value: '' })

/**
 * 宿泊データを新形式にそろえる。旧形式（文字列）の下書きや過去データにも対応する
 * （サーバー側 trips/lodging.py と同じ規則）。
 */
export function normalizeLodging(item: unknown): Lodging {
  if (item && typeof item === 'object') {
    const raw = item as { mode?: unknown; value?: unknown }
    const value = String(raw.value ?? '')
    const mode = ['name', 'area', 'omakase'].includes(String(raw.mode)) ? (raw.mode as LodgingMode) : value ? 'name' : ''
    return { mode, value: mode === 'omakase' ? '' : value }
  }
  const text = typeof item === 'string' ? item.trim() : ''
  if (!text) return emptyLodging()
  if (text === '未定' || text === 'おまかせ') return { mode: 'omakase', value: '' }
  return { mode: 'name', value: text }
}

export type TripForm = {
  title: string
  theme: string
  destination: string
  date_from: string
  date_to: string
  outbound_transport: string
  outbound_transport_other: string
  outbound_reservation: string
  return_transport: string
  return_transport_other: string
  return_reservation: string
  meeting_place: string
  dismissal_place: string
  lodgings: Lodging[]
  must_spots: string[]
  want_spots: string[]
  schedule_paces: string[]
  schedule_pace_other: string
  rough_plans: string[]
  constraints: Constraint[]
  ng_items: string[]
  notes: string[]
  free_notes: string
  collect_feedback: boolean
  /** 出力設定: 画像生成用プロンプトも出力するか */
  image_enabled: boolean
  image_mood: string
  design_taste: string
  design_taste_other: string
  color_image: string
  color_image_other: string
  aspect_ratio: string
  aspect_ratio_other: string
}

export type FieldError = { field: string; message: string }

export type Trip = TripForm & {
  trip_id: string
  prompt_text: string
  image_prompt_text: string
  /** 意見募集リンクのキー。未発行なら空 */
  join_key: string
  nights: number
  days: number
  schedule_paces_label: string
  design_taste_label: string
  color_image_label: string
  aspect_ratio_label: string
  created_at: string
  updated_at: string
}

export type TripSummary = {
  trip_id: string
  title: string
  date_from: string
  date_to: string
  nights: number
  created_at: string
}

export type FeatureRequestItem = {
  id: number
  nickname: string
  category: string
  body: string
  created_at: string
}

export type PlaceSuggestion = {
  label: string
  detail: string
  value: string
}

export type TableColumn = { name: string; verbose_name: string; type: string }

export type TableInfo = {
  table: string
  verbose_name: string
  count: number | null
  columns: TableColumn[]
}

/** 保存済みのTripを、再編集用にCreatePageのフォーム形式へ変換する。 */
/** 廃止した入力欄（スケジュール感・NG項目・配慮メモ）の値を自由入力欄の末尾へまとめる。 */
function mergeLegacyNotes(trip: Trip): string {
  const parts = [trip.free_notes.trim()]
  if (trip.schedule_paces.length > 0 && trip.schedule_paces_label) parts.push(`スケジュール感: ${trip.schedule_paces_label}`)
  const ng = trip.ng_items.filter((item) => item.trim())
  if (ng.length > 0) parts.push(`NG項目: ${ng.join('、')}`)
  const notes = trip.notes.filter((item) => item.trim())
  if (notes.length > 0) parts.push(`配慮事項: ${notes.join('、')}`)
  return parts.filter(Boolean).join('\n')
}

export function tripToForm(trip: Trip): TripForm {
  return {
    title: trip.title,
    theme: trip.theme,
    destination: trip.destination,
    date_from: trip.date_from,
    date_to: trip.date_to,
    outbound_transport: trip.outbound_transport ?? '',
    outbound_transport_other: trip.outbound_transport_other ?? '',
    outbound_reservation: trip.outbound_reservation ?? '',
    return_transport: trip.return_transport ?? '',
    return_transport_other: trip.return_transport_other ?? '',
    return_reservation: trip.return_reservation ?? '',
    meeting_place: trip.meeting_place,
    dismissal_place: trip.dismissal_place,
    lodgings: (trip.lodgings ?? []).map(normalizeLodging),
    must_spots: trip.must_spots.length > 0 ? trip.must_spots : [''],
    want_spots: trip.want_spots.length > 0 ? trip.want_spots : [''],
    // スケジュール感・NG項目・配慮メモは入力欄を廃止し、自由入力欄へまとめて表示する。
    schedule_paces: [],
    schedule_pace_other: '',
    rough_plans: trip.rough_plans,
    constraints: trip.constraints,
    ng_items: [''],
    notes: [''],
    free_notes: mergeLegacyNotes(trip),
    collect_feedback: Boolean(trip.collect_feedback),
    image_enabled: Boolean(trip.image_enabled),
    image_mood: trip.image_mood ?? '',
    design_taste: '',
    design_taste_other: '',
    color_image: '',
    color_image_other: '',
    aspect_ratio: trip.aspect_ratio,
    aspect_ratio_other: trip.aspect_ratio_other,
  }
}

export const emptyTripForm = (): TripForm => ({
  title: '',
  theme: '',
  destination: '',
  date_from: '',
  date_to: '',
  outbound_transport: '',
  outbound_transport_other: '',
  outbound_reservation: '',
  return_transport: '',
  return_transport_other: '',
  return_reservation: '',
  meeting_place: '',
  dismissal_place: '',
  lodgings: [],
  must_spots: [''],
  want_spots: [''],
  schedule_paces: [],
  schedule_pace_other: '',
  rough_plans: [],
  constraints: [],
  ng_items: [''],
  notes: [''],
  free_notes: '',
  collect_feedback: false,
  image_enabled: false,
  image_mood: '',
  design_taste: '',
  design_taste_other: '',
  color_image: '',
  color_image_other: '',
  aspect_ratio: '',
  aspect_ratio_other: '',
})

/** 意見募集リンクから参加者が追記した内容 */
export type Contribution = {
  id: number
  name: string
  must_spots: string[]
  want_spots: string[]
  constraints: Constraint[]
  rough_plans: string[]
  created_at: string
}

/** 参加者ページで見せる旅の確定情報（旅IDは含まない） */
export type JoinInfo = {
  title: string
  theme: string
  destination: string
  date_from: string
  date_to: string
  nights: number
  days: number
  lodgings: string[]
}

/** いきたいスポットのAI候補 */
export type SpotSuggestion = {
  name: string
  summary: string
  recommended_for: string
}
