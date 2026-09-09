import type { ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './components/DashboardPage'
import { ProblemsPage } from './components/ProblemsPage'
import { QueuePage } from './components/QueuePage'

function App() {
  return (
    <BrowserRouter>
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-4xl gap-6 px-4">
          <TabLink to="/">Problems</TabLink>
          <TabLink to="/queue">Today&rsquo;s queue</TabLink>
          <TabLink to="/patterns">Your patterns</TabLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<ProblemsPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/patterns" element={<DashboardPage />} />
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
