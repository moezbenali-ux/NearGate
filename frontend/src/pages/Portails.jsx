import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil, Check, X, Waves, Wifi, WifiOff, Clock, RefreshCw } from 'lucide-react'
import { api } from '../api'

const user    = () => JSON.parse(localStorage.getItem('ng_user') || '{}')
const isAdmin = () => user().role === 'admin'

const VIDE = { portail_id: '', nom: '', type: 'entree', description: '', actif: true }

function tempsRelatif(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z').getTime()) / 1000)
  if (diff < 60)    return `il y a ${diff}s`
  if (diff < 3600)  return `il y a ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
  return `il y a ${Math.floor(diff / 86400)}j`
}

function CarteRadar({ radar }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${radar.en_ligne ? '#00F5A055' : '#FF6B6B55'}`,
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: radar.en_ligne ? '#00F5A022' : '#FF6B6B22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {radar.en_ligne
          ? <Wifi size={18} color="#00F5A0" />
          : <WifiOff size={18} color="#FF6B6B" />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>{radar.label}</strong>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: radar.en_ligne ? '#00F5A022' : '#FF6B6B22',
            color: radar.en_ligne ? '#00F5A0' : '#FF6B6B',
            border: `1px solid ${radar.en_ligne ? '#00F5A055' : '#FF6B6B55'}`,
          }}>
            {radar.en_ligne ? 'En ligne' : 'Hors ligne'}
          </span>
          {!radar.portail_id && (
            <span style={{ fontSize: 11, color: '#FFB347', background: '#FFB34722', border: '1px solid #FFB34755', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>
              Non assigné
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', color: 'var(--electric)' }}>{radar.mac}</span>
          {radar.ip && <span>IP : <strong style={{ color: 'var(--text)' }}>{radar.ip}</strong></span>}
          {radar.firmware_version && (
            <span>Firmware : <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>v{radar.firmware_version}</strong></span>
          )}
          {radar.vu_le
            ? <span><Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />Vu {tempsRelatif(radar.vu_le)}</span>
            : <span style={{ color: '#FF6B6B' }}>Jamais vu — vérifiez la connexion</span>
          }
        </div>
      </div>
    </div>
  )
}

export default function Portails() {
  const [portails,    setPortails]    = useState([])
  const [radars,      setRadars]      = useState([])
  const [form,        setForm]        = useState(VIDE)
  const [ajout,       setAjout]       = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [notif,       setNotif]       = useState(null)
  const [erreur,      setErreur]      = useState(null)
  const [capteurEtat, setCapteurEtat] = useState({})

  const charger = useCallback(async () => {
    try {
      const [p, sup] = await Promise.all([api.portails(), api.supervision()])
      setPortails(p)
      setRadars(sup.esp32)
    } catch (e) {
      setErreur(e.message)
    }
  }, [])

  useEffect(() => {
    charger()
    const interval = setInterval(charger, 30000)
    return () => clearInterval(interval)
  }, [charger])

  function flash(msg, ok = true) {
    setNotif({ msg, ok })
    setTimeout(() => setNotif(null), 3000)
  }

  async function ajouter(e) {
    e.preventDefault()
    if (!form.portail_id.trim() || !form.nom.trim()) return
    try {
      await api.creerPortail({ ...form, portail_id: form.portail_id.trim().toLowerCase().replace(/\s/g, '_') })
      setForm(VIDE)
      setAjout(false)
      flash('Portail créé.')
      charger()
    } catch (err) {
      flash(err.message, false)
    }
  }

  function commencerEdit(p) {
    setEditId(p.portail_id)
    setEditForm({ nom: p.nom, type: p.type, description: p.description || '', actif: Boolean(p.actif), esp32_mac: p.esp32_mac || '' })
  }

  async function sauvegarderEdit(portailId) {
    try {
      await api.modifierPortail(portailId, editForm)
      setEditId(null)
      flash('Portail mis à jour.')
      charger()
    } catch (err) {
      flash(err.message, false)
    }
  }

  async function supprimer(portailId, nom) {
    if (!window.confirm(`Supprimer le portail "${nom}" ?\n\nCette action est irréversible.`)) return
    try {
      await api.supprimerPortail(portailId)
      flash('Portail supprimé.')
      charger()
    } catch (err) {
      flash(err.message, false)
    }
  }

  async function toggleActif(p) {
    try {
      await api.modifierPortail(p.portail_id, { actif: !p.actif })
      charger()
    } catch (err) {
      flash(err.message, false)
    }
  }

  async function toggleCapteur(p) {
    const actuelActif = capteurEtat[p.portail_id] !== false
    const nouvelEtat = !actuelActif
    try {
      await api.configurerCapteur(p.portail_id, nouvelEtat)
      setCapteurEtat(s => ({ ...s, [p.portail_id]: nouvelEtat }))
      flash(nouvelEtat ? 'Capteur ultrason activé.' : 'Capteur ultrason bypassé.')
    } catch (err) {
      flash(err.message, false)
    }
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1>NearGate Radars</h1>
          <p>{radars.length} radar(s) connu(s) — {radars.filter(r => r.en_ligne).length} en ligne</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={charger}><RefreshCw size={13} /> Actualiser</button>
          {isAdmin() && (
            <button className="btn btn-primary" onClick={() => setAjout(v => !v)}>
              <Plus size={15} /> Ajouter un portail
            </button>
          )}
        </div>
      </div>

      {notif && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
          background: notif.ok ? '#00F5A022' : '#FF6B6B22',
          border: `1px solid ${notif.ok ? '#00F5A055' : '#FF6B6B55'}`,
          color: notif.ok ? '#00F5A0' : '#FF6B6B',
        }}>
          {notif.msg}
        </div>
      )}

      {erreur && (
        <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: '#FF6B6B22', border: '1px solid #FF6B6B55', color: '#FF6B6B' }}>
          {erreur}
        </div>
      )}

      {/* ── Cartes Radars ── */}
      <div className="box" style={{ marginBottom: 24 }}>
        <div className="box-header">
          <h2>Radars connectés</h2>
          <span style={{ fontSize: 13, color: 'var(--slate)' }}>Mise à jour automatique toutes les 30s</span>
        </div>
        <div className="box-body">
          {radars.length === 0 ? (
            <div className="empty">Aucun NearGate Radar détecté. Vérifiez la connexion WiFi des boîtiers.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {radars.map(r => <CarteRadar key={r.mac} radar={r} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Formulaire d'ajout ── */}
      {ajout && isAdmin() && (
        <div className="box" style={{ marginBottom: 24 }}>
          <div className="box-header"><h2>Nouveau portail</h2></div>
          <form className="box-body" onSubmit={ajouter}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div className="field">
                <label>Identifiant <span className="text-muted text-sm">(sans espaces)</span></label>
                <input
                  placeholder="ex : entree_nord"
                  value={form.portail_id}
                  onChange={e => setForm(f => ({ ...f, portail_id: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                  required
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>
              <div className="field">
                <label>Nom affiché</label>
                <input
                  placeholder="ex : Entrée parking Nord"
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="entree">Entrée</option>
                  <option value="sortie">Sortie</option>
                  <option value="entree_sortie">Entrée / Sortie</option>
                </select>
              </div>
              <div className="field">
                <label>Description <span className="text-muted text-sm">(optionnel)</span></label>
                <input
                  placeholder="ex : Portail sous-sol niveau -1"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm"><Check size={14} /> Créer</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAjout(false); setForm(VIDE) }}>Annuler</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Liste des portails ── */}
      <div className="box">
        <div className="box-header">
          <h2>Portails configurés</h2>
          <span style={{ fontSize: 13, color: 'var(--slate)' }}>{portails.length} portail(s) — {portails.filter(p => p.actif).length} actif(s)</span>
        </div>
        <div className="table-wrap">
          {portails.length === 0
            ? <div className="empty">Aucun portail configuré</div>
            : (
              <table>
                <thead>
                  <tr>
                    <th>Identifiant</th>
                    <th>Nom</th>
                    <th>Type</th>
                    <th>NearGate Radar (MAC)</th>
                    <th>Connectivité</th>
                    <th>Firmware</th>
                    <th>Capteur</th>
                    <th>Statut</th>
                    {isAdmin() && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {portails.map(p => (
                    <tr key={p.portail_id}>
                      <td className="text-sm" style={{ fontFamily: 'monospace', color: 'var(--electric)' }}>
                        {p.portail_id}
                      </td>

                      {editId === p.portail_id ? (
                        <>
                          <td>
                            <input value={editForm.nom} onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))} style={{ width: '100%', fontSize: 13 }} />
                          </td>
                          <td>
                            <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} style={{ fontSize: 13 }}>
                              <option value="entree">Entrée</option>
                              <option value="sortie">Sortie</option>
                              <option value="entree_sortie">Entrée / Sortie</option>
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <input
                                value={editForm.esp32_mac}
                                onChange={e => setEditForm(f => ({ ...f, esp32_mac: e.target.value.toLowerCase().replace(/[^0-9a-f]/g, '') }))}
                                style={{ width: '100%', fontSize: 13, fontFamily: 'monospace' }}
                                placeholder="ex : a4cf12abcdef"
                                maxLength={12}
                              />
                              {radars.filter(r => !r.portail_id).length > 0 && (
                                <select
                                  defaultValue=""
                                  onChange={e => { if (e.target.value) setEditForm(f => ({ ...f, esp32_mac: e.target.value })) }}
                                  style={{ fontSize: 12, background: 'var(--navy-light)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px' }}
                                >
                                  <option value="">Assigner un radar…</option>
                                  {radars.filter(r => !r.portail_id).map(r => (
                                    <option key={r.mac} value={r.mac}>
                                      {r.mac}{r.en_ligne ? ' ✓' : ' (hors ligne)'}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                          <td>—</td>
                          <td>—</td>
                          <td>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                              <input type="checkbox" checked={editForm.actif} onChange={e => setEditForm(f => ({ ...f, actif: e.target.checked }))} />
                              Actif
                            </label>
                          </td>
                          <td>—</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => sauvegarderEdit(p.portail_id)}><Check size={13} /> Sauver</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}><X size={13} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><strong>{p.nom}</strong></td>
                          <td>
                            {p.type === 'entree_sortie' ? (
                              <span style={{ display: 'inline-flex', gap: 4 }}>
                                <span className="badge entree">↘ Entrée</span>
                                <span className="badge sortie">↗ Sortie</span>
                              </span>
                            ) : (
                              <span className={`badge ${p.type === 'entree' ? 'entree' : 'sortie'}`}>
                                {p.type === 'entree' ? '↘ Entrée' : '↗ Sortie'}
                              </span>
                            )}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: p.esp32_mac ? 'var(--electric)' : 'var(--slate)' }}>
                            {p.esp32_mac || <span className="text-muted">Non assigné</span>}
                          </td>
                          <td>
                            {p.esp32_mac == null ? (
                              <span className="text-muted text-sm">—</span>
                            ) : p.esp32_en_ligne ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#00F5A0' }}>
                                <Wifi size={13} /> En ligne
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#FF6B6B' }}>
                                <WifiOff size={13} /> {p.esp32_vu_le ? 'Hors ligne' : 'Jamais vu'}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {p.esp32_firmware_version
                              ? <span style={{ fontFamily: 'monospace', color: 'var(--electric)' }}>v{p.esp32_firmware_version}</span>
                              : <span className="text-muted">—</span>
                            }
                          </td>
                          <td>
                            {p.esp32_mac && isAdmin() ? (() => {
                              const actif = capteurEtat[p.portail_id] !== false
                              return (
                                <button
                                  onClick={() => toggleCapteur(p)}
                                  title={actif ? 'Capteur actif — cliquer pour bypasser' : 'Capteur bypassé — cliquer pour réactiver'}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', border: 'none',
                                    background: actif ? '#00E5FF22' : '#FF6B6B22',
                                    color: actif ? 'var(--electric)' : '#FF6B6B',
                                  }}
                                >
                                  <Waves size={12} />
                                  {actif ? 'Actif' : 'Bypassé'}
                                </button>
                              )
                            })() : <span className="text-muted text-sm">—</span>}
                          </td>
                          <td>
                            {isAdmin() ? (
                              <button
                                className={`badge ${p.actif ? 'actif' : ''}`}
                                onClick={() => toggleActif(p)}
                                style={{ cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
                                title={p.actif ? 'Cliquer pour désactiver' : 'Cliquer pour activer'}
                              >
                                {p.actif ? 'Actif' : 'Inactif'}
                              </button>
                            ) : (
                              <span className={`badge ${p.actif ? 'actif' : ''}`}>
                                {p.actif ? 'Actif' : 'Inactif'}
                              </span>
                            )}
                          </td>
                          {isAdmin() && (
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => commencerEdit(p)}>
                                  <Pencil size={13} /> Éditer
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ color: '#FF6B6B' }} onClick={() => supprimer(p.portail_id, p.nom)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      <div className="box" style={{ marginTop: 24 }}>
        <div className="box-header"><h2>Comment ça marche</h2></div>
        <div className="box-body text-muted text-sm" style={{ lineHeight: 1.8 }}>
          <p>Chaque <strong>NearGate Radar</strong> s'identifie automatiquement par son adresse MAC. Collez cette MAC dans le champ <strong>NearGate Radar (MAC)</strong> du portail correspondant — aucune modification du firmware n'est nécessaire.</p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Machine d'états :</strong> quand un badge est détecté par n'importe quel portail actif, le backend décide automatiquement s'il s'agit d'une
            <span className="badge entree" style={{ marginLeft: 6, marginRight: 6 }}>↘ Entrée</span>
            ou d'une
            <span className="badge sortie" style={{ marginLeft: 6 }}>↗ Sortie</span>
            selon l'état du badge (déjà dans le parking ou non).
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Trouver la MAC :</strong> elle s'affiche dans la section <strong>Radars connectés</strong> ci-dessus dès que le boîtier est connecté au WiFi NearGate.
          </p>
        </div>
      </div>
    </div>
  )
}
