import { useId } from 'react'

import type { Choice } from '../lib/types'

type Props = {
  label: string
  choices: Choice[]
  value: string
  onChange: (value: string) => void
  otherValue: string
  otherText: string
  onOtherTextChange: (value: string) => void
  otherPlaceholder?: string
  hint?: string
  required?: boolean
}

/** 選択式の項目。「その他」を選んだときだけ自由入力欄を出す。 */
export default function ChoiceField({
  label,
  choices,
  value,
  onChange,
  otherValue,
  otherText,
  onOtherTextChange,
  otherPlaceholder = '内容を入力してください',
  hint,
  required,
}: Props) {
  const id = useId()
  const isOther = value === otherValue

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__required">必須</span>}
      </label>
      {hint && <p className="field__hint">{hint}</p>}
      <div className="choice-chips" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            className={value === choice.value ? 'chip chip--selected' : 'chip'}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {isOther && (
        <input
          id={id}
          type="text"
          className="input input--other"
          value={otherText}
          placeholder={otherPlaceholder}
          onChange={(event) => onOtherTextChange(event.target.value)}
        />
      )}
    </div>
  )
}
