import { useState, useEffect, useMemo } from 'react'
import { Car, Activity, RefreshCw, LogOut as LogOutIcon, Filter, Zap } from 'lucide-react'
import { api } from '../api'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso.replace(' ', 'T')).toLocaleString('fr-FR')
}

const PILL_STYLE = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 12px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid',
  borderColor: active ? 'var(--electric, #00E5FF)' : 'var(--border, #2a3a50)',
  background: active ? 'rgba(0,229,255,0.1)' : 'transparent',
  color: active ? 'var(--electric, #00E5FF)' : 'var(--text-muted, #8BA3C0)',
  transition: 'all .15s',
})

const SELECT_STYLE = {
  fontSize: 13,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--border, #2a3a50)',
  background: 'var(--bg-input, #1a2640)',
  color: 'inherit',
  minWidth: 160,
}

export default function Dashboard() {
  const [badges,     setBadges]     = useState([])
  const [etats,      setEtats]      = useState([])
  const [evenements, setEvenements] = useState([])
  const [portails,   setPortails]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [libererConfirm,    setLibererConfirm]    = useState(null)
  const [ouvertureEnCours,  setOuvertureEnCours]  = useState(null) // portail_id en cours d'ouverture
  const [toasts,            setToasts]            = useState([])

  function afficherToast(message, type = 'succes') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  // Filtres
  const [filtreDirection, setFiltreDirection] = useState('tous')   // 'tous' | 'entree' | 'sortie'
  const [filtrePresence,  setFiltrePresence]  = useState(false)   // false = présence masquée
  const [filtreConnu,     setFiltreConnu]     = useState('connu')  // 'tous' | 'connu' | 'inconnu'
  const [filtreUser,      setFiltreUser]      = useState('')
  const [filtrePortail,   setFiltrePortail]   = useState('')
  const [filtrePeriode,   setFiltrePeriode]   = useState('today')  // 'today' | '7j' | 'tout'

  async function charger() {
    try {
      const [b, e, ev, p] = await Promise.all([api.badges(), api.etats(), api.evenements(200), api.portails()])
      setBadges(b); setEtats(e); setEvenements(ev); setPortails(p)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    charger()
    const token = localStorage.getItem('ng_token')
    if (!token) return
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
    es.onmessage = (e) => {
      try { if (JSON.parse(e.data).type === 'evenement') charger() } catch {}
    }
    return () => es.close()
  }, [])

  const actifs = badges.filter(b => b.actif).length

  const today  = new Date().toLocaleDateString('fr-CA')
  const il7j   = new Date(Date.now() - 7 * 86400000).toLocaleDateString('fr-CA')
  const aujEv  = evenements.filter(e => e.horodatage?.startsWith(today)).length

  // Utilisateurs connus présents dans les événements
  const utilisateurs = useMemo(() => {
    const noms = new Set()
    evenements.forEach(e => { if (e.badge_nom) noms.add(e.badge_nom) })
    return [...noms].sort()
  }, [evenements])

  const evenementsFiltres = useMemo(() => {
    return evenements.filter(e => {
      if (filtreDirection !== 'tous' && e.direction !== filtreDirection) return false
      const estManuel = e.badge_uuid?.startsWith('manuel:')
      if (!filtrePresence && e.direction === 'présence') return false
      if (filtreConnu === 'connu'   && !e.badge_nom && !estManuel) return false
      if (filtreConnu === 'inconnu' && (e.badge_nom || estManuel)) return false
      if (filtreUser  && e.badge_nom !== filtreUser)  return false
      if (filtrePortail && e.portail_id !== filtrePortail) return false
      if (filtrePeriode === 'today' && !e.horodatage?.startsWith(today)) return false
      if (filtrePeriode === '7j'    && e.horodatage?.slice(0,10) < il7j) return false
      return true
    })
  }, [evenements, filtreDirection, filtreConnu, filtreUser, filtrePortail, filtrePeriode, today, il7j])

  const filtresActifs = filtreDirection !== 'tous' || filtreConnu !== 'tous' || filtreUser || filtrePortail || filtrePeriode !== 'today' || filtrePresence

  function resetFiltres() {
    setFiltreDirection('tous'); setFiltreConnu('tous')
    setFiltreUser(''); setFiltrePortail(''); setFiltrePeriode('today')
    setFiltrePresence(false)
  }

  if (loading) return <div className="empty">Chargement...</div>

  return (
    <>
    <div className="fade-up">
      <div className="page-header">
        <h1>Vue d'ensemble</h1>
        <p>Mise à jour en temps réel</p>
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-label">Badges enregistrés</div>
          <div className="card-value">{badges.length}</div>
          <div className="card-sub">{actifs} actif(s)</div>
        </div>
        <div className="card green">
          <div className="card-label">Dans le parking</div>
          <div className="card-value">{etats.length}</div>
          <div className="card-sub">véhicule(s) présent(s)</div>
        </div>
        <div className="card">
          <div className="card-label">Événements aujourd'hui</div>
          <div className="card-value">{aujEv}</div>
          <div className="card-sub">passages enregistrés</div>
        </div>
      </div>

      {/* Ouverture manuelle */}
      {portails.filter(p => p.actif).length > 0 && (
        <div className="box" style={{ marginBottom: 20 }}>
          <div className="box-header">
            <h2><Zap size={15} /> Ouverture manuelle</h2>
          </div>
          <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {portails.filter(p => p.actif).map(p => (
              <button key={p.portail_id}
                className="btn btn-primary"
                disabled={ouvertureEnCours === p.portail_id}
                onClick={async () => {
                  setOuvertureEnCours(p.portail_id)
                  try {
                    await api.ouvrirPortail(p.portail_id)
                    afficherToast(`${p.nom} ouvert`)
                  } catch (err) {
                    afficherToast(err.message || `Erreur ouverture ${p.nom}`, 'erreur')
                  } finally {
                    setOuvertureEnCours(null)
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Zap size={14} />
                {ouvertureEnCours === p.portail_id ? 'Ouverture…' : `Ouvrir — ${p.nom}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Véhicules présents */}
      <div className="box">
        <div className="box-header">
          <h2><Car size={15} /> Véhicules dans le parking</h2>
          <button className="btn btn-ghost btn-sm" onClick={charger}>
            <RefreshCw size={13} /> Actualiser
          </button>
        </div>
        <div className="table-wrap">
          {etats.length === 0
            ? <div className="empty">Aucun véhicule dans le parking</div>
            : (
              <table>
                <thead>
                  <tr><th>Nom</th><th>Entrée</th><th>Dernière vue</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {etats.map(e => (
                    <tr key={e.uuid}>
                      <td><strong>{e.nom || '—'}</strong></td>
                      <td>{fmt(e.entre_le)}</td>
                      <td>{fmt(e.last_seen_at)}</td>
                      <td>
                        {libererConfirm === e.uuid ? (
                          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#FFB347' }}>Confirmer ?</span>
                            <button className="btn btn-sm" style={{ background: '#FF6B6B22', border: '1px solid #FF6B6B55', color: '#FF6B6B' }}
                              onClick={async () => {
                                setLibererConfirm(null)
                                try { await api.libererBadge(e.uuid); charger(); afficherToast(`${e.nom || 'Badge'} libéré`) }
                                catch { afficherToast('Erreur lors de la libération', 'erreur') }
                              }}>
                              Oui
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setLibererConfirm(null)}>
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => setLibererConfirm(e.uuid)}>
                            <LogOutIcon size={13} /> Libérer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* Derniers événements */}
      <div className="box">
        <div className="box-header">
          <h2><Activity size={15} /> Derniers événements</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {evenementsFiltres.length} résultat(s)
          </span>
        </div>

        {/* Barre de filtres */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0 14px', alignItems: 'center', borderBottom: '1px solid var(--border, #2a3a50)', marginBottom: 14 }}>

          {/* Période — pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[['today', "Aujourd'hui"], ['7j', '7 jours'], ['tout', 'Tout']].map(([val, label]) => (
              <span key={val} style={PILL_STYLE(filtrePeriode === val)} onClick={() => setFiltrePeriode(val)}>{label}</span>
            ))}
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--border, #2a3a50)' }} />

          {/* Direction — pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[['tous', 'Tous'], ['entree', '↘ Entrée'], ['sortie', '↗ Sortie']].map(([val, label]) => (
              <span key={val} style={PILL_STYLE(filtreDirection === val)} onClick={() => setFiltreDirection(val)}>{label}</span>
            ))}
          </div>

          <span
            style={PILL_STYLE(filtrePresence)}
            onClick={() => setFiltrePresence(v => !v)}
            title="Afficher les événements de présence (badge détecté mais RSSI insuffisant)"
          >· Présence</span>

          <div style={{ width: 1, height: 22, background: 'var(--border, #2a3a50)' }} />

          {/* Badges connus/inconnus */}
          <select value={filtreConnu} onChange={e => { setFiltreConnu(e.target.value); setFiltreUser('') }} style={SELECT_STYLE}>
            <option value="tous">Tous les badges</option>
            <option value="connu">Badges connus</option>
            <option value="inconnu">Badges inconnus</option>
          </select>

          {/* Utilisateur — visible seulement si badges connus ou tous */}
          {filtreConnu !== 'inconnu' && (
            <select value={filtreUser} onChange={e => setFiltreUser(e.target.value)} style={SELECT_STYLE}>
              <option value="">Tous les utilisateurs</option>
              {utilisateurs.map(nom => <option key={nom} value={nom}>{nom}</option>)}
            </select>
          )}

          {/* Portail */}
          {portails.length > 0 && (
            <select value={filtrePortail} onChange={e => setFiltrePortail(e.target.value)} style={SELECT_STYLE}>
              <option value="">Tous les portails</option>
              {portails.map(p => <option key={p.portail_id} value={p.portail_id}>{p.nom}</option>)}
            </select>
          )}

          {/* Reset */}
          {filtresActifs && (
            <button className="btn btn-ghost btn-sm" onClick={resetFiltres} style={{ marginLeft: 'auto' }}>
              <Filter size={12} /> Réinitialiser
            </button>
          )}
        </div>

        <div className="table-wrap">
          {evenementsFiltres.length === 0
            ? <div className="empty">Aucun événement correspondant aux filtres</div>
            : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Utilisateur</th><th>Direction</th><th>NG Radar</th></tr>
                </thead>
                <tbody>
                  {evenementsFiltres.map(e => (
                    <tr key={e.id}>
                      <td>{fmt(e.horodatage)}</td>
                      <td>
                        {e.action === 'ouverture_manuelle' ? (
                          <div style={{ fontWeight: 500, fontSize: 14 }}>
                            ⚡ {e.badge_uuid.split(':')[1] || 'Manuel'}
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>
                              {e.badge_nom || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>Badge inconnu</span>}
                            </div>
                            <div className="text-muted text-sm">{e.badge_uuid.slice(0, 8)}…</div>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${e.action === 'ouverture_manuelle' ? 'manuel' : e.direction}`}>
                          {e.action === 'ouverture_manuelle' ? '⚡ Manuel'
                            : e.direction === 'entree' ? '↘ Entrée'
                            : e.direction === 'sortie' ? '↗ Sortie'
                            : e.direction === 'présence' ? '· Présence'
                            : e.direction}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{portails.find(p => p.portail_id === e.portail_id)?.nom || e.portail_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>

    {/* Toasts */}
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          background: t.type === 'succes' ? '#00F5A022' : '#FF6B6B22',
          border: `1px solid ${t.type === 'succes' ? '#00F5A055' : '#FF6B6B55'}`,
          color: t.type === 'succes' ? '#00F5A0' : '#FF6B6B',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {t.type === 'succes' ? '✓' : '✗'} {t.message}
        </div>
      ))}
    </div>
    <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </>
  )
}
