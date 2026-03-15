import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap, LogIn } from 'lucide-react'
import { api } from '../api'

export default function Login() {
  const [email, setEmail]   = useState('')
  const [mdp, setMdp]       = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(e) {
    e.preventDefault()
    setErreur('')
    setLoading(true)
    try {
      await api.login(email, mdp)
      navigate('/')
    } catch (err) {
      setErreur(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          <h1><Zap size={28} style={{ verticalAlign: 'middle', marginRight: 6 }} />NearGate</h1>
          <p>Gestion du portail de parking</p>
        </div>
        <form onSubmit={submit}>
          {erreur && <div className="login-error">{erreur}</div>}
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="gestionnaire@entreprise.fr" required autoFocus />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input type="password" value={mdp} onChange={e => setMdp(e.target.value)}
              placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <LogIn size={16} />
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
          <Link to="/mot-de-passe-oublie" style={{ display: 'block', textAlign: 'center', marginTop: 16, color: 'var(--slate)', fontSize: 13, textDecoration: 'none' }}>
            Mot de passe oublié ?
          </Link>
        </form>
      </div>
    </div>
  )
}
