import { useState, useEffect } from 'react'
import { Car, Users, Activity, RefreshCw, LogOut as LogOutIcon } from 'lucide-react'
import { api } from '../api'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso.replace(' ', 'T')).toLocaleString('fr-FR')
}

export default function Dashboard() {
  const [badges,     setBadges]     = useState([])
  const [etats,      setEtats]      = useState([])
  const [evenements, setEvenements] = useState([])
  const [loading,    setLoading]    = useState(true)

  async function charger() {
    try {
      const [b, e, ev] = await Promise.all([api.badges(), api.etats(), api.evenements(10)])
      setBadges(b); setEtats(e); setEvenements(ev)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    charger()

    const token = localStorage.getItem('ng_token')
    if (!token) return

    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)

    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data)
        if (type === 'evenement') charger()
      } catch {}
    }

    return () => es.close()
  }, [])

  const actifs  = badges.filter(b => b.actif).length
  const today   = new Date().toISOString().slice(0, 10)
  const aujEv   = evenements.filter(e => e.horodatage?.startsWith(today)).length

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
                  <tr>
                    <th>Nom</th><th>UUID</th><th>Entrée</th><th>Dernière vue</th><th>RSSI</th><th>Action</th>
                  </tr>
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

      <div className="box">
        <div className="box-header">
          <h2><Activity size={15} /> Derniers événements</h2>
        </div>
        <div className="table-wrap">
          {evenements.length === 0
            ? <div className="empty">Aucun événement</div>
            : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Utilisateur</th><th>Direction</th><th>RSSI</th><th>Portail</th></tr>
                </thead>
                <tbody>
                  {evenements.map(e => (
                    <tr key={e.id}>
                      <td>{fmt(e.horodatage)}</td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{e.badge_nom || e.badge_uuid}</div>
                        {e.badge_nom && <div className="text-muted text-sm">{e.badge_uuid.slice(0, 8)}…</div>}
                      </td>
                      <td>
                        <span className={`badge ${e.direction}`}>
                          {e.direction === 'entree' ? '↘ Entrée' : e.direction === 'sortie' ? '↗ Sortie' : e.direction}
                        </span>
                      </td>
                      <td className="text-muted">{e.rssi} dBm</td>
                      <td className="text-muted text-sm">{e.portail_id}</td>
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
