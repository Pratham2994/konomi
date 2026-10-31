export class ApiError extends Error {
  status: number
  code: string
  detail: unknown
  constructor(status: number, code: string, detail: unknown) {
    super(code)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!res.ok) {
    let detail: unknown = null
    try {
      detail = (await res.json()).detail
    } catch {
      /* empty body */
    }
    const code =
      detail && typeof detail === 'object' && 'code' in detail ? String((detail as { code: unknown }).code) : `http_${res.status}`
    throw new ApiError(res.status, code, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
