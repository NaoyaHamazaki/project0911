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
  feature_request_categories: Choice[]
  other_value: string
  max_trip_days: number
  max_list_items: number
  place_suggest_enabled: boolean
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

export type TripForm = {
  title: string
  theme: string
  destination: string
  date_from: string
  date_to: string
  meeting_place: string
  dismissal_place: string
  lodgings: string[]
  must_spots: string[]
  want_spots: string[]
  schedule_paces: string[]
  schedule_pace_other: string
  rough_plans: string[]
  constraints: Constraint[]
  ng_items: string[]
  notes: string[]
  free_notes: string
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
export function tripToForm(trip: Trip): TripForm {
  return {
    title: trip.title,
    theme: trip.theme,
    destination: trip.destination,
    date_from: trip.date_from,
    date_to: trip.date_to,
    meeting_place: trip.meeting_place,
    dismissal_place: trip.dismissal_place,
    lodgings: trip.lodgings,
    must_spots: trip.must_spots.length > 0 ? trip.must_spots : [''],
    want_spots: trip.want_spots.length > 0 ? trip.want_spots : [''],
    schedule_paces: trip.schedule_paces,
    schedule_pace_other: trip.schedule_pace_other,
    rough_plans: trip.rough_plans,
    constraints: trip.constraints,
    ng_items: trip.ng_items.length > 0 ? trip.ng_items : [''],
    notes: trip.notes.length > 0 ? trip.notes : [''],
    free_notes: trip.free_notes,
    design_taste: trip.design_taste,
    design_taste_other: trip.design_taste_other,
    color_image: trip.color_image,
    color_image_other: trip.color_image_other,
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
  design_taste: '',
  design_taste_other: '',
  color_image: '',
  color_image_other: '',
  aspect_ratio: '',
  aspect_ratio_other: '',
})
