import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Resilient Z.ai client factory (Task 29) — makes the AI coach work on ANY
 * deployment, Vercel included.
 *
 * Why: `ZAI.create()` only looks for a `.z-ai-config` FILE (cwd → home →
 * /etc). That file exists in this workspace and on a dev machine, but NOT on
 * Vercel — so every /api/chat call threw "Configuration file not found" and
 * the UI showed «ما قدرناش نوصلو للكوتش» forever. The SDK's constructor,
 * however, accepts an explicit config — so when the deployment provides
 * ZAI_BASE_URL + ZAI_API_KEY environment variables we build the client
 * directly from those; the file-based path stays as the local fallback.
 *
 * Env vars (Vercel → Settings → Environment Variables):
 *   ZAI_BASE_URL — OpenAI-compatible base URL including the version prefix
 *                  (e.g. https://api.z.ai/api/paas/v4)
 *   ZAI_API_KEY  — the matching API key
 *   ZAI_CHAT_ID / ZAI_USER_ID / ZAI_TOKEN — optional extras some gateways
 *                  require (sent as X-Chat-Id / X-User-Id / X-Token headers)
 *
 * The client is immutable after creation, so it is cached per process.
 */

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI coach is not configured: no ZAI_BASE_URL/ZAI_API_KEY env vars and no .z-ai-config file. ' +
        'Add the two env vars in Vercel → Settings → Environment Variables (see DEPLOY-VERCEL.md), then redeploy.',
    )
    this.name = 'AiNotConfiguredError'
  }
}

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>

const g = globalThis as unknown as { __floussiZai?: ZaiClient | Promise<ZaiClient> }

function envConfig(): {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
} | null {
  const baseUrl = process.env.ZAI_BASE_URL?.trim()
  const apiKey = process.env.ZAI_API_KEY?.trim()
  if (!baseUrl || !apiKey) return null
  const chatId = process.env.ZAI_CHAT_ID?.trim()
  const userId = process.env.ZAI_USER_ID?.trim()
  const token = process.env.ZAI_TOKEN?.trim()
  return {
    baseUrl,
    apiKey,
    ...(chatId ? { chatId } : {}),
    ...(userId ? { userId } : {}),
    ...(token ? { token } : {}),
  }
}

const CONFIG_FILES = ['.z-ai-config'] // resolved against cwd, home, /etc (SDK order)

/** True when SOME usable AI configuration exists (env vars or a config file). */
export function aiStatus(): 'env' | 'file' | 'missing' {
  if (envConfig()) return 'env'
  const dirs = [process.cwd(), os.homedir(), '/etc']
  for (const dir of dirs) {
    for (const name of CONFIG_FILES) {
      try {
        if (fs.existsSync(path.join(dir, name))) return 'file'
      } catch {
        /* unreadable dir → keep looking */
      }
    }
  }
  return 'missing'
}

/** Build (once) and return the Z.ai client, or throw AiNotConfiguredError. */
export async function getZai(): Promise<ZaiClient> {
  if (g.__floussiZai) return g.__floussiZai
  g.__floussiZai = (async () => {
    const cfg = envConfig()
    if (cfg) {
      // The SDK types the constructor private (it steers everyone to
      // ZAI.create()) but it is a normal public constructor at runtime.
      const Ctor = ZAI as unknown as new (c: {
        baseUrl: string
        apiKey: string
        chatId?: string
        userId?: string
        token?: string
      }) => ZaiClient
      console.log('[ai] client from env (ZAI_BASE_URL + ZAI_API_KEY)')
      return new Ctor(cfg)
    }
    // Local/sandbox path: the SDK finds .z-ai-config itself (cwd → home → /etc).
    try {
      return await ZAI.create()
    } catch (e) {
      g.__floussiZai = undefined // allow a retry once configuration is added
      throw new AiNotConfiguredError()
    }
  })()
  return g.__floussiZai
}
