import { useEffect, useId, useRef, useState } from 'react'

import { api } from '../lib/api'
import type { PlaceSuggestion } from '../lib/types'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  suggestEnabled: boolean
  id?: string
}

/**
 * 住所・場所の入力欄。
 *
 * サジェストが無効なときはただのテキスト入力として動作する。
 * 有効な場合はサーバー経由（/api/places/suggest/）で候補を取得して予測変換風に表示する。
 * 候補は「入力の補助」であり、候補にないものは自由入力のまま送信できる。
 */
export default function AddressInput({
  value,
  onChange,
  placeholder,
  disabled,
  suggestEnabled,
  id,
}: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  // フォーカス中かどうか。下書き復元など「値はあるが今ユーザーが打っていない」場合に
  // 候補APIを呼ばないためのガードとして使う（呼ぶと課金対象のAPIが無駄に消費される）。
  const [focused, setFocused] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // 直前に候補から選んだ文字列。選択直後に再検索が走るのを防ぐ。
  const justPickedRef = useRef<string | null>(null)

  useEffect(() => {
    // フォーカスしていない間の value 変化（マウント時の下書き復元・親からの一括更新など）では
    // 検索しない。ユーザーが実際にこの欄を触って文字を変えたときだけ候補を取りに行く。
    if (!focused || !suggestEnabled || disabled) return
    const query = value.trim()
    if (justPickedRef.current === query) return
    if (query.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.suggestPlaces(query)
        if (!cancelled) {
          setSuggestions(data.results)
          setOpen(data.results.length > 0)
        }
      } catch {
        // サジェストは補助機能なので、失敗しても入力は続けられるようにする。
        if (!cancelled) setSuggestions([])
      }
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [value, focused, suggestEnabled, disabled])

  // 入力欄の外をタップしたら候補を閉じる。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const pick = (suggestion: PlaceSuggestion) => {
    justPickedRef.current = suggestion.value
    onChange(suggestion.value)
    setOpen(false)
  }

  return (
    <div className="address-input" ref={wrapperRef}>
      <input
        id={inputId}
        type="text"
        className="input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        // "off" はアドレス系の入力欄だとChromeに無視されブラウザ独自の候補が
        // 二重に出てしまうため、一意な文字列を渡して確実に抑止する。
        autoComplete={`off-${inputId}`}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(event) => {
          justPickedRef.current = null
          onChange(event.target.value)
        }}
        onFocus={() => {
          setFocused(true)
          setOpen(suggestions.length > 0)
        }}
        onBlur={() => setFocused(false)}
      />
      {open && suggestions.length > 0 && (
        <ul className="address-input__list" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.value}-${index}`}>
              <button type="button" className="address-input__option" onClick={() => pick(suggestion)}>
                <span className="address-input__label">{suggestion.label}</span>
                {suggestion.detail && <span className="address-input__detail">{suggestion.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
