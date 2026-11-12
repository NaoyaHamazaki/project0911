import type { PublicTrip } from '../lib/types'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="summary__row">
      <dt className="summary__label">{label}</dt>
      <dd className="summary__value">{children}</dd>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  const filled = items.filter((item) => item.trim())
  if (filled.length === 0) return <span className="summary__empty">指定なし</span>
  return (
    <ul className="summary__list">
      {filled.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

/**
 * 公開版（人名などを伏せ、日付を月と泊数だけにしたもの）の内容。
 * 確認ページのプレビューと、公開ページ（/public/:publicKey）で使う。
 */
export default function PublicTripSummary({ trip }: { trip: PublicTrip }) {
  return (
    <dl className="summary">
      <Row label="タイトル">{trip.title || <span className="summary__empty">未入力</span>}</Row>
      {trip.theme && <Row label="テーマ">{trip.theme}</Row>}
      {trip.departure && <Row label="出発地">{trip.departure}</Row>}
      {trip.destination && <Row label="行先">{trip.destination}</Row>}
      <Row label="時期">
        {[trip.month_label, trip.period_label].filter(Boolean).join('・')}
      </Row>
      {trip.nights > 0 && (
        <Row label="宿泊先">
          <List items={trip.lodgings.map((value, index) => (value ? `${index + 1}泊目：${value}` : ''))} />
        </Row>
      )}
      <Row label="MUSTスポット">
        <List items={trip.must_spots} />
      </Row>
      <Row label="WANTスポット">
        <List items={trip.want_spots} />
      </Row>
      {trip.spot_notes && <Row label="いきたいところのメモ">{trip.spot_notes}</Row>}
      <Row label="ざっくり決まっている予定">
        <List items={trip.rough_plans.map((plan, index) => (plan ? `${index + 1}日目：${plan}` : ''))} />
      </Row>
      <Row label="予約済みの予定">
        <List
          items={trip.constraints.map((row) =>
            [row.day ? `${row.day}日目` : '', row.time, row.content].filter(Boolean).join(' '),
          )}
        />
      </Row>
      {trip.free_notes && (
        <Row label="考慮事項・備考">
          <span className="public-trip__notes">{trip.free_notes}</span>
        </Row>
      )}
    </dl>
  )
}
