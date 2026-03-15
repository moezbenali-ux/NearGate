import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Power, Trash2 } from 'lucide-react'
import { api } from '../api'
import ImportCSV from '../components/ImportCSV'

const CSV_EXEMPLE_BADGES = `uuid,nom
aabbccdd-0011-2233-4455-667788990011,Jean Dupont
bbccddee-1122-3344-5566-778899001122,Marie Martin
`

export default function Badges() {
  const [badges, setBadges] = useState([])
  const [form,   setForm]   = useState({ uuid: '', nom: '' })
  const [notif,  setNotif]  = useState(null)

  async function charger() { setBadges(await api.badges()) }
  useEffect(() => { charger() }, [])

  function afficherNotif(msg, type = 'ok') {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3000)
  }

  async function ajouter(e) {
    e.preventDefault()
    try {
      await api.ajouterBadge({ uuid: form.uuid.trim(), nom: form.nom.trim() })
      setForm({ uuid: '', nom: '' })
      afficherNotif('Badge ajouté avec succès.')
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

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Badges</h1>
        <p>Gérez les badges autorisés à accéder au parking</p>
      </div>

      <div className="box">
        <div className="box-header"><h2><Plus size={15} /> Ajouter un badge</h2></div>
        <div className="box-body" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
          <div className="text-muted text-sm" style={{ marginBottom: 8, fontWeight: 500 }}>Import CSV</div>
          <ImportCSV
            endpoint="/badges/import"
            colonnes="uuid, nom"
            exemple={CSV_EXEMPLE_BADGES}
            nomExemple="badges_exemple.csv"
            onSuccess={charger}
          />
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
              <div className="field">
                <label>Nom / Titulaire</label>
                <input placeholder="Jean Dupont"
                  value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required />
              </div>
              <button className="btn btn-primary" type="submit">
                <Plus size={15} /> Ajouter
              </button>
            </div>
          </form>
        </div>
      </div>

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
                  <tr><th>Nom</th><th>UUID</th><th>Statut</th><th>Créé le</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {badges.map(b => (
                    <tr key={b.uuid}>
                      <td><strong>{b.nom}</strong></td>
                      <td className="text-muted text-sm">{b.uuid}</td>
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
    </div>
  )
}
