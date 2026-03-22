import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Power, Trash2, Wifi, WifiOff, Loader, CheckCircle, AlertCircle, Battery, BatteryLow, Pencil, Check, X } from 'lucide-react'
import { api } from '../api'
import ImportCSV from '../components/ImportCSV'

const CSV_EXEMPLE_BADGES = `uuid,nom
aabbccdd-0011-2233-4455-667788990011,Jean Dupont
bbccddee-1122-3344-5566-778899001122,Marie Martin
`

function RssiBar({ rssi }) {
  const pct = Math.max(0, Math.min(100, ((rssi + 100) / 70) * 100))
  const color = pct > 60 ? '#00F5A0' : pct > 30 ? '#00E5FF' : '#FF6B6B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 6, background: 'var(--navy-light)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{rssi} dBm</span>
    </div>
  )
}

export default function Badges() {
  const [badges, setBadges] = useState([])
  const [form,   setForm]   = useState({ uuid: '', minor: '', nom: '' })
  const [notif,  setNotif]  = useState(null)

  // Scan BLE
  const [scan,    setScan]    = useState(null)
  const [scanning, setScanning] = useState(false)
  const [duree,   setDuree]   = useState(5)
  const [ajouts,  setAjouts]  = useState({})
  const [scanErr, setScanErr] = useState(null)
  const [supervision,    setSupervision]    = useState(null)
  const [enAttente,      setEnAttente]      = useState([])
  const [editNomId,      setEditNomId]      = useState(null)
  const [editNom,        setEditNom]        = useState('')
  const [nomApprobation, setNomApprobation] = useState({}) // badge_key → nom saisi

  async function charger() {
    const [b, sup, ea] = await Promise.all([api.badges(), api.supervision(), api.badgesEnAttente()])
    setBadges(b)
    setSupervision(sup)
    setEnAttente(ea)
  }
  useEffect(() => {
    charger()
    const token = localStorage.getItem('ng_token')
    if (!token) return
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
    es.onmessage = (e) => {
      try { if (JSON.parse(e.data).type === 'badge_en_attente') api.badgesEnAttente().then(setEnAttente) } catch {}
    }
    return () => es.close()
  }, [])

  function afficherNotif(msg, type = 'ok') {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3000)
  }

  async function ajouter(e) {
    e.preventDefault()
    try {
      const nom = form.nom.trim()
      await api.ajouterBadge({
        uuid:   form.uuid.trim(),
        minor:  form.minor ? parseInt(form.minor) : undefined,
        nom,
        modele: nom,
      })
      setForm({ uuid: '', minor: '', nom: '' })
      afficherNotif('Badge ajouté avec succès.')
      charger()
    } catch (err) { afficherNotif(err.message, 'err') }
  }

  function commencerEditNom(b) {
    setEditNomId(b.uuid)
    setEditNom(b.nom)
  }

  async function sauvegarderNom(b) {
    if (!editNom.trim()) return
    try {
      await api.modifierBadge(b.uuid, { nom: editNom.trim() })
      setEditNomId(null)
      charger()
    } catch (err) { afficherNotif(err.message, 'err') }
  }

  async function toggleActif(b) {
    await api.modifierBadge(b.uuid, { actif: !b.actif })
    afficherNotif(b.actif ? 'Badge désactivé.' : 'Badge activé.')
    charger()
  }

  async function supprimer(b) {
    if (!confirm(`Supprimer le badge "${b.nom}" ?`)) return
    await api.supprimerBadge(b.uuid)
    afficherNotif('Badge supprimé.')
    charger()
  }

  async function lancerScan() {
    setScanning(true)
    setScanErr(null)
    setScan(null)
    setAjouts({})
    try {
      setScan(await api.radarScan(duree))
    } catch (e) {
      setScanErr(e.message)
    } finally {
      setScanning(false)
    }
  }

  async function ajouterDepuisScan(ap) {
    const key = `${ap.uuid_ibeacon}:${ap.minor}`
    setAjouts(a => ({ ...a, [key]: 'loading' }))
    try {
      const nom = ap.nom_ble && ap.nom_ble !== 'Inconnu'
        ? ap.nom_ble
        : `Badge Minor ${ap.minor ?? ap.uuid_ibeacon?.slice(0, 8)}`
      await api.ajouterBadge({ uuid: ap.uuid_ibeacon, minor: ap.minor, nom, modele: nom, actif: true })
      setAjouts(a => ({ ...a, [key]: 'ok' }))
      setScan(s => ({ ...s, appareils: s.appareils.map(x => x.adresse === ap.adresse ? { ...x, enregistre: true } : x) }))
      charger()
    } catch (e) {
      setAjouts(a => ({ ...a, [key]: 'err:' + e.message }))
    }
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1>Badges</h1>
          <p>Gérez les badges autorisés à accéder au parking</p>
        </div>
      </div>

      {/* ── Scan BLE ── */}
      <div className="box" style={{ marginBottom: 24 }}>
        <div className="box-header">
          <h2><Wifi size={15} /> Scanner les badges BLE</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={duree}
              onChange={e => setDuree(Number(e.target.value))}
              disabled={scanning}
              style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
            >
              <option value={3}>3 s</option>
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
              <option value={15}>15 s</option>
            </select>
            <button onClick={lancerScan} disabled={scanning} className="btn btn-primary btn-sm">
              {scanning ? <><Loader size={14} className="spin" /> Scan…</> : <><Wifi size={14} /> Lancer le scan</>}
            </button>
          </div>
        </div>

        {scanErr && (
          <div style={{ padding: '12px 16px', background: '#FF6B6B22', borderTop: '1px solid #FF6B6B55', color: '#FF6B6B', fontSize: 14 }}>
            {scanErr}
          </div>
        )}

        {scanning && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--slate)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--electric)', margin: '0 auto 12px', animation: 'pulse 1.5s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wifi size={26} color="var(--electric)" />
            </div>
            <p style={{ fontSize: 14 }}>Recherche des badges à proximité…</p>
          </div>
        )}

        {scan && !scanning && (
          <div className="box-body">
            <div style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>
              {scan.appareils.filter(a => a.uuid_ibeacon).length} iBeacon(s) détecté(s) sur {scan.total} appareils
            </div>
            {scan.appareils.filter(a => a.uuid_ibeacon).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--slate)' }}>
                <WifiOff size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p style={{ fontSize: 14 }}>Aucun badge iBeacon trouvé. Approchez les badges du Raspberry Pi.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scan.appareils.filter(a => a.uuid_ibeacon).map(ap => {
                  const key = `${ap.uuid_ibeacon}:${ap.minor}`
                  return (
                    <div key={ap.adresse} style={{
                      background: 'var(--navy-light)', border: '1px solid var(--electric)',
                      borderRadius: 10, padding: '12px 16px',
                      display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, background: '#00E5FF22', color: 'var(--electric)', border: '1px solid var(--electric)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>iBeacon</span>
                          <strong style={{ fontSize: 14 }}>{ap.nom_ble !== 'Inconnu' ? ap.nom_ble : `Minor ${ap.minor}`}</strong>
                          {ap.enregistre && <span style={{ fontSize: 12, color: '#00F5A0' }}>✓ {ap.nom_badge}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: 'monospace', marginBottom: 4 }}>{ap.uuid_ibeacon}</div>
                        <div style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span>Major : <strong style={{ color: 'var(--text)' }}>{ap.major ?? '—'}</strong></span>
                          <span>Minor : <strong style={{ color: 'var(--electric)' }}>{ap.minor ?? '—'}</strong></span>
                          {ap.batterie != null && (
                            <span style={{ color: ap.batterie > 50 ? '#00F5A0' : ap.batterie > 20 ? '#FFB347' : '#FF6B6B', fontWeight: 600 }}>
                              🔋 {ap.batterie}%
                            </span>
                          )}
                        </div>
                        <RssiBar rssi={ap.rssi} />
                      </div>
                      <div style={{ minWidth: 110, textAlign: 'right' }}>
                        {!ap.enregistre && !ajouts[key] && (
                          <button onClick={() => ajouterDepuisScan(ap)} className="btn btn-primary btn-sm">
                            <Plus size={13} /> Ajouter
                          </button>
                        )}
                        {ajouts[key] === 'loading' && <span style={{ fontSize: 13, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><Loader size={13} className="spin" /> Ajout…</span>}
                        {ajouts[key] === 'ok' && <span style={{ fontSize: 13, color: '#00F5A0', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><CheckCircle size={13} /> Ajouté</span>}
                        {ajouts[key]?.startsWith('err:') && <span style={{ fontSize: 12, color: '#FF6B6B', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><AlertCircle size={13} /> {ajouts[key].slice(4)}</span>}
                        {ap.enregistre && (
                          <span style={{ fontSize: 12, color: ap.actif ? '#00F5A0' : 'var(--slate)', background: ap.actif ? '#00F5A022' : 'var(--navy-light)', border: `1px solid ${ap.actif ? '#00F5A055' : 'var(--border)'}`, borderRadius: 6, padding: '4px 10px' }}>
                            {ap.actif ? 'Actif' : 'Désactivé'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Ajout manuel ── */}
      <div className="box">
        <div className="box-header"><h2><Plus size={15} /> Ajouter un badge manuellement</h2></div>
        <div className="box-body" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
          <div className="text-muted text-sm" style={{ marginBottom: 8, fontWeight: 500 }}>Import CSV</div>
          <ImportCSV endpoint="/badges/import" colonnes="uuid, nom" exemple={CSV_EXEMPLE_BADGES} nomExemple="badges_exemple.csv" onSuccess={charger} />
        </div>
        <div className="box-body">
          {notif && <div className={`notif ${notif.type}`}>{notif.msg}</div>}
          <form onSubmit={ajouter}>
            <div className="form-row">
              <div className="field">
                <label>UUID iBeacon</label>
                <input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={form.uuid} onChange={e => setForm(f => ({ ...f, uuid: e.target.value }))} required />
              </div>
              <div className="field" style={{ maxWidth: 140 }}>
                <label>Minor <span className="text-muted text-sm">(optionnel)</span></label>
                <input placeholder="ex : 10129" type="number"
                  value={form.minor} onChange={e => setForm(f => ({ ...f, minor: e.target.value }))} />
              </div>
              <div className="field">
                <label>Nom / Titulaire</label>
                <input placeholder="Jean Dupont"
                  value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required />
              </div>
              <button className="btn btn-primary" type="submit"><Plus size={15} /> Ajouter</button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Badges en attente ── */}
      {enAttente.length > 0 && (
        <div className="box" style={{ borderColor: '#FFB347', marginBottom: 24 }}>
          <div className="box-header">
            <h2 style={{ color: '#FFB347' }}>⚠ {enAttente.length} badge(s) détecté(s) non reconnu(s)</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Identifiant (UUID:Minor)</th><th>Portail</th><th>RSSI</th><th>Premier vu</th><th>Nom à attribuer</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {enAttente.map(b => (
                  <tr key={b.badge_key}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{b.badge_key}</td>
                    <td className="text-muted text-sm">{b.portail_id}</td>
                    <td className="text-muted">{b.rssi} dBm</td>
                    <td className="text-muted text-sm">{b.premier_vu?.slice(0, 16)}</td>
                    <td>
                      <input
                        placeholder="Nom du badge"
                        value={nomApprobation[b.badge_key] || ''}
                        onChange={e => setNomApprobation(n => ({ ...n, [b.badge_key]: e.target.value }))}
                        style={{ fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--electric)', background: 'var(--navy-light)', color: 'var(--text)', width: 160 }}
                      />
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!nomApprobation[b.badge_key]?.trim()}
                          onClick={async () => {
                            await api.approuverBadge(b.badge_key, nomApprobation[b.badge_key])
                            afficherNotif('Badge approuvé et enregistré.')
                            charger()
                          }}
                        >
                          <Check size={13} /> Approuver
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={async () => {
                            await api.ignorerBadgeEnAttente(b.badge_key)
                            setEnAttente(ea => ea.filter(x => x.badge_key !== b.badge_key))
                          }}
                        >
                          <X size={13} /> Ignorer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      <div className="box">
        <div className="box-header">
          <h2>Liste des badges ({badges.length})</h2>
          <button className="btn btn-ghost btn-sm" onClick={charger}><RefreshCw size={13} /> Actualiser</button>
        </div>
        <div className="table-wrap">
          {badges.length === 0
            ? <div className="empty">Aucun badge enregistré</div>
            : (
              <table>
                <thead>
                  <tr><th>Nom</th><th>Modèle</th><th>Identifiant (UUID:Minor)</th><th>Statut</th><th>Créé le</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {badges.map(b => (
                    <tr key={b.uuid}>
                      <td>
                        {editNomId === b.uuid ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              value={editNom}
                              onChange={e => setEditNom(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') sauvegarderNom(b); if (e.key === 'Escape') setEditNomId(null) }}
                              autoFocus
                              style={{ fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--electric)', background: 'var(--navy-light)', color: 'var(--text)', width: 160 }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => sauvegarderNom(b)}><Check size={12} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditNomId(null)}><X size={12} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>{b.nom}</strong>
                            <button onClick={() => commencerEditNom(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 2, display: 'flex' }}>
                              <Pencil size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 13, fontFamily: b.modele ? 'monospace' : 'inherit', color: b.modele ? 'var(--text)' : 'var(--slate)' }}>
                          {b.modele || '—'}
                        </span>
                      </td>
                      <td className="text-muted text-sm" style={{ fontFamily: 'monospace', fontSize: 12 }}>{b.uuid}</td>
                      <td><span className={`badge ${b.actif ? 'actif' : 'inactif'}`}>{b.actif ? 'Actif' : 'Inactif'}</span></td>
                      <td className="text-muted text-sm">{b.cree_le?.slice(0, 10)}</td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActif(b)}>
                            <Power size={13} /> {b.actif ? 'Désactiver' : 'Activer'}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => supprimer(b)}>
                            <Trash2 size={13} /> Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* ── Batterie & Activité ── */}
      <div className="box" style={{ marginTop: 24 }}>
        <div className="box-header">
          <h2>Batterie &amp; Activité</h2>
          <button className="btn btn-ghost btn-sm" onClick={charger}><RefreshCw size={13} /> Actualiser</button>
        </div>
        <div className="table-wrap">
          {!supervision || supervision.badges.length === 0 ? (
            <div className="empty">Aucun badge enregistré.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  {['Badge', 'Statut', 'Batterie', 'Dernière détection'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supervision.badges.map((b, i) => {
                  const pct = b.batterie_pct
                  const couleur = pct == null ? 'var(--slate)' : pct > 50 ? '#00F5A0' : pct > 20 ? '#FFB347' : '#FF6B6B'
                  const Icon = pct != null && pct <= 20 ? BatteryLow : Battery
                  return (
                    <tr key={b.uuid}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{b.nom}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: 'monospace', marginTop: 2 }}>{b.uuid.slice(0, 18)}…</div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                          background: b.actif ? '#00F5A022' : 'var(--navy-light)',
                          color: b.actif ? '#00F5A0' : 'var(--slate)',
                          border: `1px solid ${b.actif ? '#00F5A055' : 'var(--border)'}`,
                        }}>
                          {b.actif ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td>
                        {pct == null
                          ? <span style={{ color: 'var(--slate)', fontSize: 13 }}>—</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: couleur, fontWeight: 600, fontSize: 14 }}>
                              <Icon size={15} />{pct}%
                            </span>
                        }
                        {pct != null && pct <= 20 && <div style={{ fontSize: 11, color: '#FF6B6B', marginTop: 3 }}>⚠ Pile faible</div>}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--slate)' }}>
                        {b.derniere_vue_le
                          ? (() => {
                              const diff = Math.floor((Date.now() - new Date(b.derniere_vue_le.replace(' ', 'T')).getTime()) / 1000)
                              if (diff < 60)    return `il y a ${diff}s`
                              if (diff < 3600)  return `il y a ${Math.floor(diff / 60)}min`
                              if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
                              return `il y a ${Math.floor(diff / 86400)}j`
                            })()
                          : <span style={{ color: '#FF6B6B' }}>Jamais détecté</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.1);opacity:0.7} }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
