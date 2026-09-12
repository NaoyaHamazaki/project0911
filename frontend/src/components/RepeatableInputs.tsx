import AddressInput from './AddressInput'

type Props = {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  /** 住所サジェストを使う項目か */
  asAddress?: boolean
  suggestEnabled?: boolean
  addLabel?: string
  max: number
}

/**
 * ＋／✕ で行を増減できる入力欄のリスト。
 * いきたいスポット・NG項目・配慮メモで共通に使う。
 */
export default function RepeatableInputs({
  values,
  onChange,
  placeholder,
  asAddress = false,
  suggestEnabled = false,
  addLabel = '追加する',
  max,
}: Props) {
  const rows = values.length > 0 ? values : ['']

  const update = (index: number, value: string) => {
    const next = [...rows]
    next[index] = value
    onChange(next)
  }

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : [''])
  }

  const add = () => {
    if (rows.length >= max) return
    onChange([...rows, ''])
  }

  return (
    <div className="repeatable">
      {rows.map((value, index) => (
        <div className="repeatable__row" key={index}>
          {asAddress ? (
            <AddressInput
              value={value}
              onChange={(next) => update(index, next)}
              placeholder={placeholder}
              suggestEnabled={suggestEnabled}
            />
          ) : (
            <input
              type="text"
              className="input"
              value={value}
              placeholder={placeholder}
              onChange={(event) => update(index, event.target.value)}
            />
          )}
          <button
            type="button"
            className="icon-button icon-button--remove"
            onClick={() => remove(index)}
            disabled={rows.length === 1 && !rows[0]}
            aria-label={`${index + 1}行目を削除`}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="add-button" onClick={add} disabled={rows.length >= max}>
        ＋ {addLabel}
      </button>
      {rows.length >= max && <p className="field__hint">これ以上は追加できません（最大{max}件）。</p>}
    </div>
  )
}
