import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Badges from './pages/Badges'
import Historique from './pages/Historique'
import Configuration from './pages/Configuration'
import Gestionnaires from './pages/Gestionnaires'
import Supervision from './pages/Supervision'
import GenerateurFirmware from './pages/GenerateurFirmware'
import Portails from './pages/Portails'
import Mobile from './pages/Mobile'
import MotDePasseOublie from './pages/MotDePasseOublie'
import ReinitialiserMdp from './pages/ReinitialiserMdp'
import Layout from './components/Layout'

function ProtectedRoute({ children }) {
  return localStorage.getItem('ng_token') ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/mobile" element={<Mobile />} />
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
        <Route path="/reinitialiser-mdp" element={<ReinitialiserMdp />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="badges" element={<Badges />} />
          <Route path="historique" element={<Historique />} />
          <Route path="configuration" element={<Configuration />} />
          <Route path="portails" element={<Portails />} />
          <Route path="gestionnaires" element={<Gestionnaires />} />
          <Route path="supervision" element={<Supervision />} />
          <Route path="firmware" element={<GenerateurFirmware />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
