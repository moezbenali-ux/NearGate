import { useState, useEffect } from 'react'
import { Plus, RefreshCw, UserX } from 'lucide-react'
import { api } from '../api'
import ImportCSV from '../components/ImportCSV'

const CSV_EXEMPLE = `email,nom,mot_de_passe,role
jean.dupont@entreprise.fr,Jean Dupont,MotDePasse123!,gestionnaire
marie.martin@entreprise.fr,Marie Martin,MotDePasse456!,admin
`

export default function Gestionnaires() {
  const [users, setUsers] = useState([])
  const [form,  setForm]  = useState({ email: '', nom: '', mot_de_passe: '', role: 'gestionnaire' })
  const [notif, setNotif] = useState(null)

  async function charger() { setUsers(await api.utilisateurs()) }
  useEffect(() => { charger() }, [])

  function afficherNotif(msg, type = 'ok') {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3000)
  }

  async function ajouter(e) {
    e.preventDefault()
    try {
      await api.creerUtilisateur(form)
      setForm({ email: '', nom: '', mot_de_passe: '', role: 'gestionnaire' })
      afficherNotif('Gestionnaire créé avec succès.')
      charger()
    } catch (err) { afficherNotif(err.message, 'err') }
  }

  async function supprimer(u) {
    if (!confirm(`Désactiver le compte de "${u.nom}" ?`)) return
    await api.supprimerUtilisateur(u.id)
    afficherNotif('Compte désactivé.')
    charger()
  }

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Gestionnaires</h1>
        <p>Comptes ayant accès au dashboard NearGate</p>
      </div>

      <div className="box">
        <div className="box-header"><h2><Plus size={15} /> Ajouter un gestionnaire</h2></div>
        <div className="box-body" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
          <div className="text-muted text-sm" style={{ marginBottom: 8, fontWeight: 500 }}>Import CSV</div>
          <ImportCSV
            endpoint="/utilisateurs/import"
            colonnes="email, nom, mot_de_passe, role"
            exemple={CSV_EXEMPLE}
            nomExemple="gestionnaires_exemple.csv"
            onSuccess={charger}
          />
        </div>
        <div className="box-body">
          {notif && <div className={`notif ${notif.type}`}>{notif.msg}</div>}
          <form onSubmit={ajouter}>
            <div className="form-row">
              <div className="field">
                <label>Email</label>
                <input type="email" placeholder="prenom.nom@entreprise.fr"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="field">
                <label>Nom</label>
                <input placeholder="Prénom Nom"
                  value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required />
              </div>
              <div className="field">
                <label>Mot de passe</label>
                <input type="password" placeholder="••••••••"
                  value={form.mot_de_passe} onChange={e => setForm(f => ({ ...f, mot_de_passe: e.target.value }))} required />
              </div>
              <div className="field">
                <label>Rôle</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="gestionnaire">Gestionnaire</option>
                  <option value="admin">Administrateur</option>
                </select>
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
          <h2>Comptes actifs ({users.filter(u => u.actif).length})</h2>
          <button className="btn btn-ghost btn-sm" onClick={charger}><RefreshCw size={13} /> Actualiser</button>
        </div>
        <div className="table-wrap">
          {users.length === 0
            ? <div className="empty">Aucun gestionnaire</div>
            : (
              <table>
                <thead>
                  <tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.nom}</strong></td>
                      <td className="text-muted">{u.email}</td>
                      <td><span className={`badge ${u.role === 'admin' ? 'entree' : 'sortie'}`}>{u.role}</span></td>
                      <td><span className={`badge ${u.actif ? 'actif' : 'inactif'}`}>{u.actif ? 'Actif' : 'Inactif'}</span></td>
                      <td className="text-muted text-sm">{u.cree_le?.slice(0, 10)}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => supprimer(u)}>
                          <UserX size={13} /> Désactiver
                        </button>
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
