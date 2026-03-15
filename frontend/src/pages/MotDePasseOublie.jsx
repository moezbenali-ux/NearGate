import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, ArrowLeft } from 'lucide-react'

export default function MotDePasseOublie() {
  const [email, setEmail]     = useState('')
  const [envoye, setEnvoye]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur]   = useState('')

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setErreur('')
    try {
      const res = await fetch('/auth/mot-de-passe-oublie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      setEnvoye(true)
    } catch {
      setErreur('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">
          <h1><Zap size={28} style={{ verticalAlign: 'middle', marginRight: 6 }} />NearGate</h1>
          <p>Réinitialisation du mot de passe</p>
        </div>

        {envoye ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
            <p style={{ color: 'var(--text)', marginBottom: 8 }}>
              Si cet email est enregistré, vous recevrez un lien de réinitialisation dans quelques instants.
            </p>
            <p style={{ color: 'var(--slate)', fontSize: 13, marginBottom: 24 }}>
              Vérifiez aussi vos spams.
            </p>
            <Link to="/login" style={{ color: 'var(--electric)', fontSize: 14, textDecoration: 'none' }}>
              ← Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {erreur && <div className="login-error">{erreur}</div>}
            <div className="field">
              <label>Votre adresse email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="gestionnaire@entreprise.fr"
                required
                autoFocus
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
            </button>
            <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--slate)', fontSize: 13, textDecoration: 'none', marginTop: 16, justifyContent: 'center' }}>
              <ArrowLeft size={13} /> Retour à la connexion
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
