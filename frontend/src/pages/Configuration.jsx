import { useState, useEffect } from 'react'
import { Save, RotateCcw } from 'lucide-react'
import { api } from '../api'

const LABELS = {
  rssi_seuil_entree:     { label: 'Seuil RSSI entrée (dBm)',       desc: 'Signal minimum côté extérieur pour ouvrir à l\'entrée. Recommandé : -70' },
  rssi_seuil_sortie:     { label: 'Seuil RSSI sortie (dBm)',       desc: 'Signal minimum côté intérieur pour la sortie (zone ~1m). Recommandé : -55' },
  rssi_oubli:            { label: 'RSSI d\'oubli (dBm)',           desc: 'En dessous de cette valeur, le badge est considéré hors zone. Recommandé : -90' },
  timeout_interieur_min: { label: 'Timeout intérieur (minutes)',    desc: 'Durée maximale de blacklist après une entrée. Recommandé : 120 (2h)' },
  timeout_non_vu_min:    { label: 'Timeout non vu (minutes)',      desc: 'Libération automatique si badge non détecté depuis X minutes. Recommandé : 10' },
}

export default function Configuration() {
  const [config,  setConfig]  = useState({})
  const [valeurs, setValeurs] = useState({})
  const [notif,   setNotif]   = useState(null)

  async function charger() {
    const c = await api.config()
    setConfig(c)
    setValeurs({ ...c })
  }

  useEffect(() => { charger() }, [])

  async function sauvegarder(cle) {
    await api.modifierConfig(cle, valeurs[cle])
    setNotif({ msg: `"${LABELS[cle]?.label || cle}" mis à jour.`, type: 'ok' })
    setTimeout(() => setNotif(null), 3000)
    charger()
  }

  const modifie = (cle) => valeurs[cle] !== config[cle]

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1>Configuration</h1>
        <p>Paramètres de détection et de comportement du portail</p>
      </div>

      {notif && <div className={`notif ${notif.type}`}>{notif.msg}</div>}

      <div className="box">
        <div className="box-header"><h2>Paramètres RSSI et timeouts</h2></div>
        <div className="box-body">
          {Object.entries(valeurs).map(([cle, val]) => {
            const meta = LABELS[cle] || { label: cle, desc: '' }
            return (
              <div key={cle} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
                <div style={{ marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>{meta.label}</strong>
                  {meta.desc && <div className="text-muted text-sm" style={{ marginTop: 3 }}>{meta.desc}</div>}
                </div>
                <div className="form-row">
                  <div className="field">
                    <input value={valeurs[cle]} style={{ minWidth: 140 }}
                      onChange={e => setValeurs(v => ({ ...v, [cle]: e.target.value }))} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => sauvegarder(cle)} disabled={!modifie(cle)}>
                    <Save size={13} /> Sauvegarder
                  </button>
                  {modifie(cle) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setValeurs(v => ({ ...v, [cle]: config[cle] }))}>
                      <RotateCcw size={13} /> Annuler
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
