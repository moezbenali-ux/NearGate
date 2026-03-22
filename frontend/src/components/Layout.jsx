import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, CreditCard, History, Settings, LogOut, Zap, Users, Menu, X, Cpu, DoorOpen } from 'lucide-react'
import { api } from '../api'

const PAGES = {
  '/':               'Dashboard',
  '/badges':         'Badges',
  '/historique':     'Historique',
  '/gestionnaires':  'Gestionnaires',
  '/configuration':  'Configuration',
  '/portails':       'NearGate Radars',
  '/firmware':       'Générateur firmware',
}

const user = () => JSON.parse(localStorage.getItem('ng_user') || '{}')

export default function Layout() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const pageTitle  = PAGES[location.pathname] || 'NearGate'
  const [menuOpen, setMenuOpen] = useState(false)

  function logout() {
    api.logout()
    navigate('/login')
  }

  function fermerMenu() { setMenuOpen(false) }

  return (
    <div className="layout">
      {menuOpen && <div className="sidebar-overlay" onClick={fermerMenu} />}
      <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <Zap size={20} />
          NearGate
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <LayoutDashboard size={17} /> Dashboard
          </NavLink>
          <NavLink to="/portails" onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <DoorOpen size={17} /> NearGate Radars
          </NavLink>
          <NavLink to="/badges" onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <CreditCard size={17} /> Badges
          </NavLink>
          <NavLink to="/historique" onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <History size={17} /> Historique
          </NavLink>
          <NavLink to="/gestionnaires" onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Users size={17} /> Gestionnaires
          </NavLink>
          <NavLink to="/configuration" onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Settings size={17} /> Configuration
          </NavLink>
          <NavLink to="/firmware" onClick={fermerMenu} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <Cpu size={17} /> Firmware ESP32
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="menu-toggle" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="topbar-title">{pageTitle}</span>
        </div>
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
