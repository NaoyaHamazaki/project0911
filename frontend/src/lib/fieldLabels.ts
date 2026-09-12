/** サーバーが返すフィールド名を画面上の見出しに対応づける。 */
export const FIELD_LABELS: Record<string, string> = {
  title: 'タイトル',
  theme: 'テーマ',
  destination: '行先',
  date_from: '期間（自）',
  date_to: '期間（至）',
  meeting_place: '集合場所',
  dismissal_place: '解散場所',
  lodgings: '宿泊場所',
  must_spots: 'いきたいスポット（MUST）',
  want_spots: 'いきたいスポット（WANT）',
  schedule_paces: 'スケジュール感',
  schedule_pace_other: 'スケジュール感（その他）',
  rough_plans: 'ざっくり決まっている予定',
  constraints: '予約済みの予定',
  ng_items: 'NG項目',
  notes: '配慮・共有メモ',
  free_notes: '自由入力欄',
  design_taste: 'デザインテイスト',
  design_taste_other: 'デザインテイスト（その他）',
  color_image: 'カラーイメージ',
  color_image_other: 'カラーイメージ（その他）',
  aspect_ratio: '出力サイズ',
  aspect_ratio_other: '出力サイズ（その他）',
  body: '要望の内容',
  nickname: 'ニックネーム',
  category: 'カテゴリ',
}

export function labelOf(field: string): string {
  return FIELD_LABELS[field] ?? field
}
