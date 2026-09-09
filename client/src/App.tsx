import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { fetchSettings } from './api'
import type { SettingsResponse } from './types'
import { ConnectionChip } from './components/ConnectionChip'
import { ConnectWizard } from './components/ConnectWizard'
import { DashboardPage } from './components/DashboardPage'
import { HistoryPage } from './components/HistoryPage'
import { ProblemsPage } from './components/ProblemsPage'
import { QueuePage } from './components/QueuePage'

const SKIP_KEY = 'lc.skipConnect'

const UNKNOWN_SETTINGS: SettingsResponse = {
  connected: false,
  username: null,
  avatarUrl: null,
  submissionsSyncedAt: null,
  viaEnvOnly: false,
}

function App() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [skipped, setSkipped] = useState(() => localStorage.getItem(SKIP_KEY) === '1')

  const loadSettings = useCallback(() => {
    fetchSettings().then(setSettings).catch(() => setSettings(UNKNOWN_SETTINGS))
  }, [])

  useEffect(loadSettings, [loadSettings])

  if (settings === null) return null // brief first load

  // First run: not connected and hasn't chosen to skip -> the wizard is the app.
  if (!settings.connected && !skipped) {
    return (
      <ConnectWizard
        onSkip={() => {
          localStorage.setItem(SKIP_KEY, '1')
          setSkipped(true)
        }}
        onComplete={loadSettings}
      />
    )
  }

  return (
    <BrowserRouter>
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4">
          <TabLink to="/">Problems</TabLink>
          <TabLink to="/queue">Today&rsquo;s queue</TabLink>
          <TabLink to="/patterns">Your patterns</TabLink>
          <TabLink to="/history">History</TabLink>
          <div className="ml-auto">
            <ConnectionChip
              settings={settings}
              onChanged={loadSettings}
              onReconnect={() => {
                localStorage.removeItem(SKIP_KEY)
                setSkipped(false)
              }}
            />
          </div>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<ProblemsPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/patterns" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function TabLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        'border-b-2 py-3 text-sm transition-colors ' +
        (isActive
          ? 'border-accent text-ink'
          : 'border-transparent text-muted hover:text-ink')
      }
    >
      {children}
    </NavLink>
  )
}

export default App
