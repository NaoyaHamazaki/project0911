import { formatDate, formatPeriod, nightsBetween } from '../lib/format'
import type { Choice, Lodging, Options, TripForm } from '../lib/types'

function labelOfChoice(choices: Choice[] | undefined, value: string, otherValue: string, otherText: string, empty = '未選択') {
  if (!value) return empty
  if (value === otherValue) return otherText || '未入力'
  return choices?.find((choice) => choice.value === value)?.label ?? value
}

function lodgingText(lodging: Lodging) {
  if (lodging.mode === 'omakase') return 'おまかせ'
  if (lodging.mode === 'area') return lodging.value ? `${lodging.value}（検討エリア）` : '検討エリア（未入力）'
  if (lodging.mode === 'name') return lodging.value || '宿名（未入力）'
  return ''
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

function Text({ value, empty = '未入力' }: { value: string; empty?: string }) {
  return <>{value || <span className="summary__empty">{empty}</span>}</>
}

/** 入力内容の一覧。ステップ④「最終調整と出力」で確認用に表示する。 */
export default function TripSummaryCard({ form, options }: { form: TripForm; options: Options }) {
  const nights = nightsBetween(form.date_from, form.date_to)
  const other = options.other_value

  const transport = (prefix: 'outbound' | 'return') => {
    const label = labelOfChoice(
      options.transports,
      form[`${prefix}_transport`],
      other,
      form[`${prefix}_transport_other`],
      '未選択',
    )
    const reservation = labelOfChoice(options.reservation_statuses, form[`${prefix}_reservation`], other, '', '予約状況未選択')
    return `${label}（${reservation}）`
  }

  return (
    <section className="card">
      <h2 className="card__title">入力内容の確認</h2>
      <dl className="summary">
        <SummaryRow label="タイトル"><Text value={form.title} /></SummaryRow>
        <SummaryRow label="テーマ"><Text value={form.theme} /></SummaryRow>
        <SummaryRow label="行先"><Text value={form.destination} /></SummaryRow>
        <SummaryRow label="期間">{formatPeriod(form.date_from, form.date_to)}</SummaryRow>
        <SummaryRow label="往路">{transport('outbound')}</SummaryRow>
        <SummaryRow label="復路">{transport('return')}</SummaryRow>
        {(form.meeting_place || form.dismissal_place) && (
          <SummaryRow label="集合・解散">
            {[form.meeting_place && `集合：${form.meeting_place}`, form.dismissal_place && `解散：${form.dismissal_place}`]
              .filter(Boolean)
              .join(' ／ ')}
          </SummaryRow>
        )}
        <SummaryRow label="宿泊先">
          {nights === 0 ? (
            <span className="summary__empty">日帰り</span>
          ) : (
            <ListValue
              items={form.lodgings.map((l, i) => (lodgingText(l) ? `${i + 1}泊目：${lodgingText(l)}` : ''))}
              empty="未選択"
            />
          )}
        </SummaryRow>
        <SummaryRow label="MUSTスポット"><ListValue items={form.must_spots} /></SummaryRow>
        <SummaryRow label="WANTスポット"><ListValue items={form.want_spots} /></SummaryRow>
        <SummaryRow label="ざっくり決まっている予定">
          <ListValue items={form.rough_plans.map((p, i) => (p ? `${i + 1}日目：${p}` : ''))} />
        </SummaryRow>
        <SummaryRow label="予約済みの予定">
          <ListValue
            items={form.constraints.map((row) =>
              row.content ? [row.date ? formatDate(row.date) : '', row.time, row.content].filter(Boolean).join(' ') : '',
            )}
          />
        </SummaryRow>
        <SummaryRow label="考慮事項"><Text value={form.free_notes} empty="指定なし" /></SummaryRow>
        <SummaryRow label="旅行意見聴取">{form.collect_feedback ? '参加者に意見を聞く' : '聞かない'}</SummaryRow>
        <SummaryRow label="出力サイズ">
          {labelOfChoice(options.aspect_ratios, form.aspect_ratio, other, form.aspect_ratio_other, 'おまかせ')}
        </SummaryRow>
      </dl>
    </section>
  )
}
