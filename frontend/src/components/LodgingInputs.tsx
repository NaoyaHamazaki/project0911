import AddressInput from './AddressInput'
import type { Lodging } from '../lib/types'

type Props = {
  lodgings: Lodging[]
  onChange: (lodgings: Lodging[]) => void
  suggestEnabled: boolean
  /** 未入力の泊を赤枠で示す（「次へ」を押したあと） */
  showErrors?: boolean
}

/**
 * 泊ごとに宿名を入力する。
 * 以前の「検討エリア」「おまかせ」は廃止した。過去データの検討エリアは宿名欄にそのまま表示し、
 * 編集すると宿名（mode: name）として保存される。おまかせは空欄で表示される。
 */
export default function LodgingInputs({ lodgings, onChange, suggestEnabled, showErrors = false }: Props) {
  const setAt = (index: number, value: string) => {
    const list = [...lodgings]
    list[index] = { mode: value.trim() ? 'name' : '', value }
    onChange(list)
  }

  return (
    <div className="lodging-list">
      {lodgings.map((lodging, index) => {
        const previous = index > 0 ? lodgings[index - 1] : null
        // 前の泊が入力済みで、この泊がまだ空なら「前泊と同じ」を出す。
        const showSame = previous !== null && previous.value.trim() !== '' && lodging.value.trim() === ''
        const missing = showErrors && !lodging.value.trim()
        return (
          <div className="lodging-list__row" key={index}>
            <div className="lodging-list__head">
              <span className="lodging-list__label">{index + 1}泊目</span>
              {showSame && (
                <button type="button" className="field-shortcut" onClick={() => setAt(index, previous.value)}>
                  {index}泊目と同じ
                </button>
              )}
            </div>
            <div className={missing ? 'lodging-list__input lodging-list__input--error' : 'lodging-list__input'}>
              <AddressInput
                value={lodging.value}
                onChange={(value) => setAt(index, value)}
                placeholder="例）〇〇ホテル 京都"
                suggestEnabled={suggestEnabled}
              />
            </div>
            {missing && <p className="field__error">{index + 1}泊目の宿名を入力してください。</p>}
          </div>
        )
      })}
    </div>
  )
}
