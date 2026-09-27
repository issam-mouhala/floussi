import type { Lang } from './i18n'

export function langFromRequest(req: Request): Lang {
  const url = new URL(req.url)
  const l = url.searchParams.get('lang')
  return l === 'fr' || l === 'ary' ? l : 'en'
}

export function ok(data: unknown, headers?: Record<string, string>) {
  return Response.json(data, { headers })
}

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}
