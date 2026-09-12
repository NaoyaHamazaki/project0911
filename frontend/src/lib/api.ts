import type {
  FeatureRequestItem,
  FieldError,
  Options,
  PlaceSuggestion,
  TableInfo,
  Trip,
  TripForm,
  TripSummary,
} from './types'

/**
 * ビジネスエラー（入力内容の誤り）。確認ページで項目ごとに表示する。
 */
export class BusinessError extends Error {
  errors: FieldError[]
  constructor(errors: FieldError[]) {
    super('入力内容に誤りがあります。')
    this.name = 'BusinessError'
    this.errors = errors
  }
}

/**
 * アプリケーションエラー（通信不能・サーバー異常など）。復旧操作を促す。
 */
export class AppError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'AppError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new AppError('サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。')
  }

  if (response.status === 204) {
    return undefined as T
  }

  let body: unknown = null
  const text = await response.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const data = body as { errors?: FieldError[]; detail?: string } | null
    if (response.status === 400 && data?.errors?.length) {
      throw new BusinessError(data.errors)
    }
    if (response.status === 404) {
      throw new AppError(data?.detail ?? 'データが見つかりませんでした。', 404)
    }
    throw new AppError(
      data?.detail ?? `サーバーでエラーが発生しました（${response.status}）。時間をおいて再度お試しください。`,
      response.status,
    )
  }

  return body as T
}

export const api = {
  options: () => request<Options>('/api/options/'),

  validateTrip: (form: TripForm) =>
    request<{ errors: FieldError[]; prompt_text: string; consistency_warnings: string[] }>(
      '/api/trips/validate/',
      { method: 'POST', body: JSON.stringify(form) },
    ),

  createTrip: (form: TripForm, deviceKey: string) =>
    request<Trip>('/api/trips/', {
      method: 'POST',
      body: JSON.stringify({ ...form, device_key: deviceKey }),
    }),

  getTrip: (tripId: string) => request<Trip>(`/api/trips/${encodeURIComponent(tripId)}/`),

  myTrips: (deviceKey: string) =>
    request<{ results: TripSummary[] }>(`/api/trips/?device_key=${encodeURIComponent(deviceKey)}`),

  featureRequests: () => request<{ results: FeatureRequestItem[] }>('/api/feature-requests/'),

  createFeatureRequest: (payload: { nickname: string; category: string; body: string; device_key: string }) =>
    request<FeatureRequestItem>('/api/feature-requests/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  suggestPlaces: (query: string) =>
    request<{ enabled: boolean; results: PlaceSuggestion[] }>(
      `/api/places/suggest/?q=${encodeURIComponent(query)}`,
    ),

  tableStatus: () => request<{ engine: string; tables: TableInfo[] }>('/api/db-status/'),

  tableRows: (table: string) =>
    request<{ table: string; columns: string[]; rows: Record<string, unknown>[]; limit: number }>(
      `/api/db-status/${encodeURIComponent(table)}/rows/`,
    ),
}
