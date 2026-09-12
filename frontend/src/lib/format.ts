const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

/** 期間から泊数を求める。未入力・不正・逆転時は 0 を返す。 */
export function nightsBetween(from: string, to: string): number {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return 0
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

export function formatDate(value: string): string {
  const date = parseDate(value)
  if (!date) return value || ''
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`
}

export function formatPeriod(from: string, to: string): string {
  if (!from || !to) return '未入力'
  const nights = nightsBetween(from, to)
  const label = nights === 0 ? '日帰り' : `${nights}泊${nights + 1}日`
  return `${formatDate(from)} 〜 ${formatDate(to)}（${label}）`
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
