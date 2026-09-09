import { useState } from 'react'
import { disconnectLeetCode, syncLeetCode } from '../api'
import type { SettingsResponse } from '../types'

interface Props {
  settings: SettingsResponse
  /** Re-fetch settings after a sync/disconnect. */
  onChanged: () => void
  /** User wants the connect wizard again (clears the "skip" flag). */
  onReconnect: () => void
}

function relTime(iso: string | null): string {
  if (!iso) return 'not synced'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'synced just now'
  if (mins < 60) return `synced ${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `synced ${hrs}h ago`
  return `synced ${Math.round(hrs / 24)}d ago`
}

/** The nav's LeetCode connection indicator + menu. */
export function ConnectionChip({ settings, onChanged, onReconnect }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'sync' | 'disconnect'>(null)
  const [avatarBroken, setAvatarBroken] = useState(false)

  const showAvatar = settings.avatarUrl && !avatarBroken && busy !== 'sync'

  if (!settings.connected) {
    return (
      <button
        type="button"
        onClick={onReconnect}
        className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-accent hover:bg-surface-2"
      >
        Connect LeetCode
      </button>
    )
  }

  async function run(action: 'sync' | 'disconnect') {
    setBusy(action)
    try {
      if (action === 'sync') await syncLeetCode()
      else await disconnectLeetCode()
      onChanged()
    } catch {
      /* the wizard / a retry surfaces errors; the chip stays quiet */
    }
    setBusy(null)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-2"
      >
        {showAvatar ? (
          <img
            src={settings.avatarUrl ?? undefined}
            alt=""
            onError={() => setAvatarBroken(true)}
            className="h-4 w-4 rounded-full object-cover"
          />
        ) : (
          <span
            className={
              'h-1.5 w-1.5 rounded-full ' +
              (busy === 'sync' ? 'animate-pulse bg-medium motion-reduce:animate-none' : 'bg-easy')
            }
          />
        )}
        {settings.username ?? 'connected'}
        <span className="text-dim">· {busy === 'sync' ? 'syncing…' : relTime(settings.submissionsSyncedAt)}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface text-sm shadow-xl">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('sync')}
            className="block w-full px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            disabled={busy !== null || settings.viaEnvOnly}
            onClick={() => run('disconnect')}
            title={settings.viaEnvOnly ? 'Connected via server .env — edit that file to disconnect' : undefined}
            className="block w-full border-t border-line px-3 py-2 text-left text-hard hover:bg-surface-2 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
