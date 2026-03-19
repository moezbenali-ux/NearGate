import { useState } from 'react'
import { api } from '../api'

const user = () => JSON.parse(localStorage.getItem('ng_user') || '{}')

function BoutonPortail({ label, portailId }) {
  const [etat, setEtat] = useState('idle') // idle | loading | ok | err

  async function ouvrir() {
    setEtat('loading')
    try {
      await api.ouvrirPortail(portailId)
      setEtat('ok')
      setTimeout(() => setEtat('idle'), 3000)
    } catch (e) {
      setEtat('err')
      setTimeout(() => setEtat('idle'), 3000)
    }
  }

  const config = {
    idle:    { bg: '#00E5FF22', border: '#00E5FF', color: '#00E5FF', text: label },
    loading: { bg: '#00E5FF11', border: '#00E5FF55', color: '#00E5FF88', text: '…' },
    ok:      { bg: '#00F5A022', border: '#00F5A0', color: '#00F5A0', text: 'Ouvert ✓' },
    err:     { bg: '#FF6B6B22', border: '#FF6B6B', color: '#FF6B6B', text: 'Erreur' },
  }[etat]

  return (
    <button
      onClick={ouvrir}
      disabled={etat === 'loading'}
      style={{
        width: '100%',
        padding: '32px 24px',
        background: config.bg,
        border: `2px solid ${config.border}`,
        borderRadius: 20,
        color: config.color,
        fontSize: 20,
        fontWeight: 700,
        fontFamily: 'Space Grotesk, sans-serif',
        cursor: etat === 'loading' ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        letterSpacing: '0.02em',
      }}
    >
      {config.text}
    </button>
  )
}

export default function Mobile() {
  const nom = user().nom || 'Collaborateur'

  if (!localStorage.getItem('ng_token')) {
    window.location.href = '/login'
    return null
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#080E1A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: 'Space Grotesk, sans-serif',
      color: '#E2E8F0',
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#00E5FF' }}>NearGate</h1>
      <p style={{ color: '#64748B', margin: '0 0 48px', fontSize: 14 }}>Bonjour, {nom}</p>

      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <BoutonPortail label="🚗  Entrée — Ouvrir le portail" portailId="entree_ext" />
        <BoutonPortail label="🚶  Sortie — Ouvrir le portail" portailId="sortie_ext" />
      </div>

      <button
        onClick={() => { api.logout(); window.location.href = '/login' }}
        style={{
          marginTop: 48,
          background: 'none',
          border: 'none',
          color: '#64748B',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Déconnexion
      </button>
    </div>
  )
}
