import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, CreditCard, History, Settings, LogOut, Zap, Users, Radar, Activity } from 'lucide-react'
import { api } from '../api'

const PAGES = {
  '/':               'Dashboard',
  '/badges':         'Badges',
  '/historique':     'Historique',
  '/gestionnaires':  'Gestionnaires',
  '/configuration':  'Configuration',
  '/radar':          'Radar BLE',
  '/supervision':    'Supervision',
}

const user = () => JSON.parse(localStorage.getItem('ng_user') || '{}')

export default function Layout() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const pageTitle = PAGES[location.pathname] || 'NearGate'

  function logout() {
    api.logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Zap size={20} />
          NearGate
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <LayoutDashboard size={17} /> Dashboard
          </NavLink>
          <NavLink to="/badges" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <CreditCard size={17} /> Badges
          </NavLink>
          <NavLink to="/historique" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <History size={17} /> Historique
          </NavLink>
          <NavLink to="/gestionnaires" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Users size={17} /> Gestionnaires
          </NavLink>
          <NavLink to="/configuration" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Settings size={17} /> Configuration
          </NavLink>
          <NavLink to="/radar" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Radar size={17} /> Radar BLE
          </NavLink>
          <NavLink to="/supervision" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Activity size={17} /> Supervision
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <strong>{user().nom}</strong>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </aside>

      <div className="topbar">
        <span className="topbar-title">{pageTitle}</span>
        <div className="topbar-right">
          <span className="topbar-user">{user().nom}</span>
        </div>
      </div>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
