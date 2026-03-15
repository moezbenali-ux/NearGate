import { useState, useRef } from 'react'
import { Upload, FileText, X } from 'lucide-react'

/**
 * Composant d'import CSV générique.
 * Props :
 *   endpoint   : URL de l'API (ex: "/badges/import")
 *   colonnes   : description des colonnes attendues (ex: "uuid, nom")
 *   exemple    : contenu CSV exemple à télécharger
 *   nomExemple : nom du fichier exemple (ex: "badges_exemple.csv")
 *   onSuccess  : callback après import réussi
 */
export default function ImportCSV({ endpoint, colonnes, exemple, nomExemple, onSuccess }) {
  const [fichier,   setFichier]   = useState(null)
  const [resultat,  setResultat]  = useState(null)
  const [loading,   setLoading]   = useState(false)
  const inputRef = useRef()

  function telechargerExemple() {
    const blob = new Blob([exemple], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = nomExemple; a.click()
    URL.revokeObjectURL(url)
  }

  async function importer() {
    if (!fichier) return
    setLoading(true)
    setResultat(null)
    try {
      const token = localStorage.getItem('ng_token')
      const form  = new FormData()
      form.append('fichier', fichier)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      setResultat(data)
      setFichier(null)
      inputRef.current.value = ''
      if (data.ajoutes > 0 && onSuccess) onSuccess()
    } catch {
      setResultat({ erreurs: ['Erreur de connexion au serveur'] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={telechargerExemple}>
          <FileText size={13} /> Télécharger un exemple CSV
        </button>
        <span className="text-muted text-sm">Colonnes attendues : <code style={{ color: 'var(--electric)', fontSize: 12 }}>{colonnes}</code></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 'var(--radius-btn)',
          border: '1px dashed var(--border20)', cursor: 'pointer',
          color: fichier ? 'var(--electric)' : 'var(--slate)',
          fontSize: 13, transition: 'border-color 200ms',
        }}>
          <Upload size={14} />
          {fichier ? fichier.name : 'Choisir un fichier CSV'}
          <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { setFichier(e.target.files[0] || null); setResultat(null) }} />
        </label>

        {fichier && (
          <>
            <button className="btn btn-primary btn-sm" onClick={importer} disabled={loading}>
              <Upload size={13} /> {loading ? 'Import...' : 'Importer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFichier(null); inputRef.current.value = '' }}>
              <X size={13} />
            </button>
          </>
        )}
      </div>

      {resultat && (
        <div style={{ marginTop: 14 }}>
          {resultat.ajoutes > 0 && (
            <div className="notif ok">✓ {resultat.ajoutes} ligne(s) importée(s) avec succès.
              {resultat.ignores > 0 && ` ${resultat.ignores} déjà existante(s) ignorée(s).`}
            </div>
          )}
          {resultat.ajoutes === 0 && resultat.ignores > 0 && (
            <div className="notif" style={{ background: 'rgba(255,181,71,0.10)', border: '1px solid rgba(255,181,71,0.25)', color: 'var(--warning)' }}>
              Toutes les lignes existent déjà ({resultat.ignores} ignorée(s)).
            </div>
          )}
          {resultat.erreurs?.length > 0 && (
            <div className="notif err">
              {resultat.erreurs.map((e, i) => <div key={i}>✗ {e}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
