import { emptyTripForm, type TripForm } from './types'

const DEVICE_KEY = 'tabishiori.device_key'
const DRAFT_KEY = 'tabishiori.draft'

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value)
  } catch {
    // プライベートブラウジングなどで保存できない場合は黙って諦める。
  }
}

/**
 * 端末を識別するキー。ログインなしで「自分が作った旅」を辿るために使う。
 * 消えた場合も trip_id を入力すれば結果ページを開ける。
 */
export function getDeviceKey(): string {
  const existing = safeGet(localStorage, DEVICE_KEY)
  if (existing) return existing
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  safeSet(localStorage, DEVICE_KEY, generated)
  return generated
}

/** 入力途中のフォーム。確認ページへの受け渡しと、リロード時の復元に使う。 */
export function loadDraft(): TripForm {
  const raw = safeGet(sessionStorage, DRAFT_KEY)
  if (!raw) return emptyTripForm()
  try {
    return { ...emptyTripForm(), ...(JSON.parse(raw) as Partial<TripForm>) }
  } catch {
    return emptyTripForm()
  }
}

export function saveDraft(form: TripForm) {
  safeSet(sessionStorage, DRAFT_KEY, JSON.stringify(form))
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // 何もしない
  }
}
