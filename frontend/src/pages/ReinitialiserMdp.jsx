import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Zap } from 'lucide-react'

export default function ReinitialiserMdp() {
  const [params]              = useSearchParams()
  const token                 = params.get('token') || ''
  const [mdp, setMdp]         = useState('')
  const [mdp2, setMdp2]       = useState('')
  const [ok, setOk]           = useState(false)
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur]   = useState('')

  async function submit(e) {
    e.preventDefault()
    if (mdp !== mdp2) { setErreur('Les mots de passe ne correspondent pas.'); return }
    if (mdp.length < 8) { setErreur('Le mot de passe doit faire au moins 8 caractères.'); return }
    setLoading(true)
    setErreur('')
    try {
      const res = await fetch('/auth/reinitialiser-mdp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mot_de_passe: mdp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erreur')
      setOk(true)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          <h1><Zap size={28} style={{ verticalAlign: 'middle', marginRight: 6 }} />NearGate</h1>
          <p>Nouveau mot de passe</p>
        </div>

        {!token ? (
          <p style={{ color: '#FF6B6B', textAlign: 'center' }}>
            Lien invalide. <Link to="/mot-de-passe-oublie" style={{ color: 'var(--electric)' }}>Faire une nouvelle demande</Link>
          </p>
        ) : ok ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <p style={{ color: 'var(--text)', marginBottom: 24 }}>Mot de passe mis à jour avec succès.</p>
            <Link to="/login" style={{ color: 'var(--electric)', fontSize: 14, textDecoration: 'none' }}>
              Se connecter →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {erreur && <div className="login-error">{erreur}</div>}
            <div className="field">
              <label>Nouveau mot de passe</label>
              <input type="password" value={mdp} onChange={e => setMdp(e.target.value)}
                placeholder="••••••••" required minLength={8} autoFocus />
            </div>
            <div className="field">
              <label>Confirmer le mot de passe</label>
              <input type="password" value={mdp2} onChange={e => setMdp2(e.target.value)}
                placeholder="••••••••" required minLength={8} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
