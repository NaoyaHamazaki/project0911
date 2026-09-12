import { useId } from 'react'

import type { Choice } from '../lib/types'

type Props = {
  label: string
  choices: Choice[]
  values: string[]
  onChange: (values: string[]) => void
  otherValue: string
  otherText: string
  onOtherTextChange: (value: string) => void
  otherPlaceholder?: string
  hint?: string
  required?: boolean
}

/** 複数選択できる項目。チップをタップするたびに選択・解除を切り替える。 */
export default function MultiChoiceField({
  label,
  choices,
  values,
  onChange,
  otherValue,
  otherText,
  onOtherTextChange,
  otherPlaceholder = '内容を入力してください',
  hint,
  required,
}: Props) {
  const id = useId()
  const isOtherSelected = values.includes(otherValue)

  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value))
    } else {
      onChange([...values, value])
    }
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__required">必須</span>}
      </label>
      {hint && <p className="field__hint">{hint}</p>}
      <p className="field__hint">複数選べます。</p>
      <div className="choice-chips" role="group" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={values.includes(choice.value)}
            className={values.includes(choice.value) ? 'chip chip--selected' : 'chip'}
            onClick={() => toggle(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {isOtherSelected && (
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
