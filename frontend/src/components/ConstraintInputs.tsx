import type { Constraint } from '../lib/types'

type Props = {
  values: Constraint[]
  onChange: (values: Constraint[]) => void
  minDate?: string
  maxDate?: string
  max: number
}

const emptyRow = (): Constraint => ({ date: '', time: '', content: '' })

/** 日付・時刻・内容の3項目を1行として増減できる入力欄。 */
export default function ConstraintInputs({ values, onChange, minDate, maxDate, max }: Props) {
  const rows = values.length > 0 ? values : [emptyRow()]

  const update = (index: number, patch: Partial<Constraint>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next)
  }

  const add = () => {
    if (rows.length >= max) return
    onChange([...rows, emptyRow()])
  }

  return (
    <div className="repeatable">
      {rows.map((row, index) => (
        <div className="constraint-row" key={index}>
          <div className="constraint-row__datetime">
            <input
              type="date"
              className="input"
              value={row.date}
              min={minDate || undefined}
              max={maxDate || undefined}
              aria-label={`予定${index + 1}の日付`}
              onChange={(event) => update(index, { date: event.target.value })}
            />
            <input
              type="time"
              className="input"
              value={row.time}
              step={300}
              aria-label={`予定${index + 1}の時刻`}
              onChange={(event) => update(index, { time: event.target.value })}
            />
          </div>
          <div className="constraint-row__content">
            <input
              type="text"
              className="input"
              value={row.content}
              placeholder="例）新幹線に乗る／予約したお店に入る"
              aria-label={`予定${index + 1}の内容`}
              onChange={(event) => update(index, { content: event.target.value })}
            />
            <button
              type="button"
              className="icon-button icon-button--remove"
              onClick={() => remove(index)}
              aria-label={`予定${index + 1}を削除`}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="add-button" onClick={add} disabled={rows.length >= max}>
        ＋ 予定を追加する
      </button>
    </div>
  )
}
