import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { api } from '../api'

const user = () => JSON.parse(localStorage.getItem('ng_user') || '{}')
const isAdmin = () => user().role === 'admin'

const TYPE_LABELS = { entree: 'Entrée', sortie: 'Sortie' }
const VIDE = { portail_id: '', nom: '', type: 'entree', description: '', actif: true }

export default function Portails() {
  const [portails,    setPortails]    = useState([])
  const [form,        setForm]        = useState(VIDE)
  const [ajout,       setAjout]       = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [notif,       setNotif]       = useState(null)
  const [erreur,      setErreur]      = useState(null)

  async function charger() {
    try {
      setPortails(await api.portails())
    } catch (e) {
      setErreur(e.message)
    }
  }

  useEffect(() => { charger() }, [])

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
    setEditForm({ nom: p.nom, type: p.type, description: p.description || '', actif: Boolean(p.actif) })
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

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1>Portails</h1>
          <p>{portails.length} portail(s) configuré(s) — {portails.filter(p => p.actif).length} actif(s)</p>
        </div>
        {isAdmin() && (
          <button className="btn btn-primary" onClick={() => setAjout(v => !v)}>
            <Plus size={15} /> Ajouter un portail
          </button>
        )}
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

      {/* Formulaire d'ajout */}
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
              <button type="submit" className="btn btn-primary btn-sm">
                <Check size={14} /> Créer
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAjout(false); setForm(VIDE) }}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des portails */}
      <div className="box">
        <div className="box-header"><h2>Portails configurés</h2></div>
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
                    <th>Description</th>
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
                            <input
                              value={editForm.nom}
                              onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))}
                              style={{ width: '100%', fontSize: 13 }}
                            />
                          </td>
                          <td>
                            <select
                              value={editForm.type}
                              onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                              style={{ fontSize: 13 }}
                            >
                              <option value="entree">Entrée</option>
                              <option value="sortie">Sortie</option>
                            </select>
                          </td>
                          <td>
                            <input
                              value={editForm.description}
                              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                              style={{ width: '100%', fontSize: 13 }}
                              placeholder="Description…"
                            />
                          </td>
                          <td>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={editForm.actif}
                                onChange={e => setEditForm(f => ({ ...f, actif: e.target.checked }))}
                              />
                              Actif
                            </label>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => sauvegarderEdit(p.portail_id)}>
                                <Check size={13} /> Sauver
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                                <X size={13} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><strong>{p.nom}</strong></td>
                          <td>
                            <span className={`badge ${p.type === 'entree' ? 'entree' : 'sortie'}`}>
                              {p.type === 'entree' ? '↘ Entrée' : '↗ Sortie'}
                            </span>
                          </td>
                          <td className="text-muted text-sm">{p.description || '—'}</td>
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
          <p>Chaque <strong>NearGate Radar</strong> (ESP32) doit être configuré avec l'identifiant du portail qu'il surveille.</p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Machine d'états :</strong> quand un badge est détecté
            par n'importe quel portail actif, le backend décide automatiquement s'il s'agit d'une
            <span className="badge entree" style={{ marginLeft: 6, marginRight: 6 }}>↘ Entrée</span>
            ou d'une
            <span className="badge sortie" style={{ marginLeft: 6 }}>↗ Sortie</span>
            selon l'état du badge (déjà dans le parking ou non).
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Seuils RSSI</strong> configurables dans la page
            <a href="/configuration" style={{ color: 'var(--electric)', marginLeft: 4 }}>Configuration</a>.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>Firmware :</strong> utilisez le
            <a href="/firmware" style={{ color: 'var(--electric)', marginLeft: 4 }}>Générateur de firmware</a>
            {' '}pour générer le code de chaque ESP32 avec l'identifiant de portail correspondant.
          </p>
        </div>
      </div>
    </div>
  )
}
