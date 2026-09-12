// @types/react (時点のバージョン)には標準DOM属性 `inert` の型定義がまだ無いため補完する。
// inert は主要ブラウザ（Chrome/Edge 102+, Safari 16.4+, Firefox 112+）でサポート済みの標準属性。
// 折りたたみ中のナビを操作・読み上げ対象から外すために使っている（Layout.tsx参照）。
import 'react'

declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: boolean
  }
}
