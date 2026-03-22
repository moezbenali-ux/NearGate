import { useState, useEffect, useMemo } from 'react'
import { Car, Activity, RefreshCw, LogOut as LogOutIcon, Filter } from 'lucide-react'
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

  // Filtres
  const [filtreDirection, setFiltreDirection] = useState('tous')   // 'tous' | 'entree' | 'sortie'
  const [filtreConnu,     setFiltreConnu]     = useState('tous')   // 'tous' | 'connu' | 'inconnu'
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
      if (filtreConnu === 'connu'   && !e.badge_nom)  return false
      if (filtreConnu === 'inconnu' &&  e.badge_nom)  return false
      if (filtreUser  && e.badge_nom !== filtreUser)  return false
      if (filtrePortail && e.portail_id !== filtrePortail) return false
      if (filtrePeriode === 'today' && !e.horodatage?.startsWith(today)) return false
      if (filtrePeriode === '7j'    && e.horodatage?.slice(0,10) < il7j) return false
      return true
    })
  }, [evenements, filtreDirection, filtreConnu, filtreUser, filtrePortail, filtrePeriode, today, il7j])

  const filtresActifs = filtreDirection !== 'tous' || filtreConnu !== 'tous' || filtreUser || filtrePortail || filtrePeriode !== 'today'

  function resetFiltres() {
    setFiltreDirection('tous'); setFiltreConnu('tous')
    setFiltreUser(''); setFiltrePortail(''); setFiltrePeriode('today')
  }

  if (loading) return <div className="empty">Chargement...</div>

  return (
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
                  <tr><th>Nom</th><th>UUID</th><th>Entrée</th><th>Dernière vue</th><th>RSSI</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {etats.map(e => (
                    <tr key={e.uuid}>
                      <td><strong>{e.nom || '—'}</strong></td>
                      <td className="text-muted text-sm">{e.uuid}</td>
                      <td>{fmt(e.entre_le)}</td>
                      <td>{fmt(e.last_seen_at)}</td>
                      <td className="text-muted">{e.last_seen_rssi} dBm</td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={async () => { await api.libererBadge(e.uuid); charger() }}>
                          <LogOutIcon size={13} /> Libérer
                        </button>
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
                  <tr><th>Date</th><th>Utilisateur</th><th>Direction</th><th>RSSI</th><th>Portail</th></tr>
                </thead>
                <tbody>
                  {evenementsFiltres.map(e => (
                    <tr key={e.id}>
                      <td>{fmt(e.horodatage)}</td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>
                          {e.badge_nom || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>Badge inconnu</span>}
                        </div>
                        <div className="text-muted text-sm">{e.badge_uuid.slice(0, 8)}…</div>
                      </td>
                      <td>
                        <span className={`badge ${e.direction}`}>
                          {e.direction === 'entree' ? '↘ Entrée' : e.direction === 'sortie' ? '↗ Sortie' : e.direction === 'présence' ? '· Présence' : e.direction}
                        </span>
                      </td>
                      <td className="text-muted">{e.rssi} dBm</td>
                      <td className="text-muted text-sm">{portails.find(p => p.portail_id === e.portail_id)?.nom || e.portail_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  )
}
