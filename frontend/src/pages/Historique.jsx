import { useState, useEffect } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { api } from '../api'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso.replace(' ', 'T')).toLocaleString('fr-FR')
}

function exporterCSV(evenements) {
  const entete = ['Date/Heure', 'Utilisateur', 'UUID', 'Direction', 'Action', 'RSSI (dBm)', 'Portail']
  const lignes = evenements.map(e => [
    fmt(e.horodatage),
    e.badge_nom || '',
    e.badge_uuid,
    e.direction,
    e.action,
    e.rssi ?? '',
    e.portail_id,
  ])
  const csv = [entete, ...lignes]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `neargate_historique_${new Date().toLocaleDateString('fr-CA')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Historique() {
  const [evenements, setEvenements] = useState([])
  const [direction,  setDirection]  = useState('')
  const [limite,     setLimite]     = useState(100)

  async function charger() {
    setEvenements(await api.evenements(limite, direction || undefined))
  }

  useEffect(() => { charger() }, [direction, limite])

  const entrees = evenements.filter(e => e.direction === 'entree').length
  const sorties = evenements.filter(e => e.direction === 'sortie').length

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Historique</h1>
        <p>{evenements.length} événement(s) — {entrees} entrée(s) · {sorties} sortie(s)</p>
      </div>

      <div className="box">
        <div className="box-header">
          <h2>Filtres</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={charger}><RefreshCw size={13} /> Actualiser</button>
            <button className="btn btn-ghost btn-sm" onClick={() => exporterCSV(evenements)} disabled={evenements.length === 0}>
              <Download size={13} /> Exporter CSV
            </button>
          </div>
        </div>
        <div className="box-body">
          <div className="form-row">
            <div className="field">
              <label>Direction</label>
              <select value={direction} onChange={e => setDirection(e.target.value)}>
                <option value="">Toutes</option>
                <option value="entree">Entrées uniquement</option>
                <option value="sortie">Sorties uniquement</option>
              </select>
            </div>
            <div className="field">
              <label>Nombre d'événements</label>
              <select value={limite} onChange={e => setLimite(Number(e.target.value))}>
                <option value={50}>50 derniers</option>
                <option value={100}>100 derniers</option>
                <option value={500}>500 derniers</option>
                <option value={1000}>1000 derniers</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="box">
        <div className="box-header"><h2>Événements</h2></div>
        <div className="table-wrap">
          {evenements.length === 0
            ? <div className="empty">Aucun événement</div>
            : (
              <table>
                <thead>
                  <tr><th>Date / Heure</th><th>Utilisateur</th><th>Direction</th><th>Action</th><th>RSSI</th><th>Portail</th></tr>
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
                      <td>
                        <span className={`badge ${e.action === 'ouverture' ? 'actif' : 'refus'}`}>{e.action}</span>
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
