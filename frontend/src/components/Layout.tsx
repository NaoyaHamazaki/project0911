import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { api } from '../lib/api'

const NAV_ITEMS = [
  { to: '/', label: 'ホーム' },
  { to: '/create', label: 'プロンプト作成' },
  { to: '/my-trips', label: '作成した旅' },
  { to: '/requests', label: '要望を送る' },
  { to: '/tables', label: 'テーブル状況' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [scrolled, setScrolled] = useState(false)
  // 768px以上はハンバーガーを使わず常時表示のナビになる（styles.css の @media と対応させる）。
  const [isDesktopNav, setIsDesktopNav] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  const location = useLocation()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // 管理者が Setting に入れたお知らせを表示する。取得に失敗しても画面は表示する。
  useEffect(() => {
    api
      .options()
      .then((options) => setNotice(options.notice))
      .catch(() => setNotice(''))
  }, [])

  // 画面遷移したらメニューを閉じ、先頭までスクロールする。
  useEffect(() => {
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  // 少しスクロールしたらヘッダーに影を足す（浮いている感を出す）。
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // デスクトップ幅かどうかを監視する（ナビの inert 制御・折りたたみアニメーションの要否に使う）。
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const onChange = () => setIsDesktopNav(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // メニューを開いている間はEscキーで閉じられるようにする。
  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <div className="app-shell">
      <header className={scrolled ? 'app-header app-header--scrolled' : 'app-header'}>
        <div className="app-header__inner">
          <Link to="/" className="app-header__logo">
            <span className="app-header__mark" aria-hidden="true">
              ✈
            </span>
            たびしおり
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            className="app-header__menu-button"
            aria-expanded={menuOpen}
            aria-controls="global-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="visually-hidden">メニュー</span>
            <span className={menuOpen ? 'burger burger--open' : 'burger'} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
        {/* 常にDOMに置いたまま max-height / opacity で開閉する（トランジションを効かせるため）。
            折りたたんでいる間は inert にして、キーボード操作やスクリーンリーダーが
            見えないリンクへ入り込まないようにする。デスクトップでは常時展開なので外す。 */}
        <nav
          id="global-nav"
          className={menuOpen ? 'app-nav app-nav--open' : 'app-nav'}
          inert={!isDesktopNav && !menuOpen}
        >
          {NAV_ITEMS.map((item, index) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={{ '--nav-index': index } as React.CSSProperties}
              className={({ isActive }) => (isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* モバイルでメニューを開いたときの背景。タップで閉じる。 */}
      <button
        type="button"
        className={menuOpen ? 'app-nav-backdrop app-nav-backdrop--open' : 'app-nav-backdrop'}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setMenuOpen(false)}
      />

      {notice && (
        <div className="site-notice" role="status">
          {notice}
        </div>
      )}

      {/* key を変えて route ごとに再マウントし、ページ切り替えのたびに入場アニメーションを効かせる。 */}
      <main className="app-main" key={location.pathname}>
        {children}
      </main>

      <footer className="app-footer">
        <p className="app-footer__note">
          旅のしおりを作るための「プロンプト」を用意するアプリです。生成AIへの入力文までを作ります。
        </p>
        <p className="app-footer__operator">運営: 株式会社GLORIS</p>
        <p className="app-footer__copy">© 株式会社GLORIS</p>
      </footer>
    </div>
  )
}
