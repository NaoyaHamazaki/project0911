import { Link, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import AdminSettingsPage from './pages/AdminSettingsPage'
import ConfirmPage from './pages/ConfirmPage'
import CreatePage from './pages/CreatePage'
import HomePage from './pages/HomePage'
import MyTripsPage from './pages/MyTripsPage'
import RequestsPage from './pages/RequestsPage'
import ResultPage from './pages/ResultPage'

function NotFoundPage() {
  return (
    <div className="page">
      <h1 className="page__title">ページが見つかりません</h1>
      <p className="page__lead">URLが変わったか、削除された可能性があります。</p>
      <div className="form__actions">
        <Link to="/" className="button button--primary">
          ホームへ戻る
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/confirm" element={<ConfirmPage />} />
        <Route path="/trip/:tripId" element={<ResultPage />} />
        <Route path="/my-trips" element={<MyTripsPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/admin-settings" element={<AdminSettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  )
}
