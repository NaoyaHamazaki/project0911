import AddressInput from './AddressInput'
import type { Choice, Lodging, LodgingMode } from '../lib/types'

type Props = {
  lodgings: Lodging[]
  onChange: (lodgings: Lodging[]) => void
  modes: Choice[]
  suggestEnabled: boolean
}

const PLACEHOLDERS: Record<string, string> = {
  name: '例）〇〇ホテル 京都',
  area: '例）京都駅周辺、祇園あたり',
}

/** 泊ごとに「宿名／検討エリア／おまかせ」から決め方を選び、必要なら内容を入力する。 */
export default function LodgingInputs({ lodgings, onChange, modes, suggestEnabled }: Props) {
  const setAt = (index: number, next: Lodging) => {
    const list = [...lodgings]
    list[index] = next
    onChange(list)
  }

  return (
    <div className="lodging-list">
      {lodgings.map((lodging, index) => {
        const previous = index > 0 ? lodgings[index - 1] : null
        // 前の泊が決まっていて、この泊がまだ未選択なら「前泊と同じ」を出す。
        const showSame = previous !== null && previous.mode !== '' && lodging.mode === ''
        return (
          <div className="lodging-list__row" key={index}>
            <div className="lodging-list__head">
              <span className="lodging-list__label">{index + 1}泊目</span>
              {showSame && (
                <button type="button" className="field-shortcut" onClick={() => setAt(index, { ...previous })}>
                  {index}泊目と同じ
                </button>
              )}
            </div>
            <div className="choice-chips" role="radiogroup" aria-label={`${index + 1}泊目の決め方`}>
              {modes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={lodging.mode === mode.value}
                  className={lodging.mode === mode.value ? 'chip chip--selected' : 'chip'}
                  onClick={() =>
                    setAt(index, {
                      mode: mode.value as LodgingMode,
                      // おまかせは内容不要。宿名⇔エリアの切り替えでは入力を残す。
                      value: mode.value === 'omakase' ? '' : lodging.value,
                    })
                  }
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {(lodging.mode === 'name' || lodging.mode === 'area') && (
              <div className="lodging-list__input">
                <AddressInput
                  value={lodging.value}
                  onChange={(value) => setAt(index, { ...lodging, value })}
                  placeholder={PLACEHOLDERS[lodging.mode]}
                  suggestEnabled={suggestEnabled}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
