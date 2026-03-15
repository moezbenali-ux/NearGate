import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Battery, BatteryLow, Clock, RefreshCw } from 'lucide-react'
import { api } from '../api'

function tempsRelatif(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)  return `il y a ${diff}s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
  return `il y a ${Math.floor(diff / 86400)}j`
}

function BatterieIndicateur({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: 'var(--slate)', fontSize: 13 }}>—</span>
  const couleur = pct > 50 ? '#00F5A0' : pct > 20 ? '#FFB347' : '#FF6B6B'
  const Icon = pct <= 20 ? BatteryLow : Battery
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: couleur, fontWeight: 600, fontSize: 14 }}>
      <Icon size={15} />
      {pct}%
    </span>
  )
}

function CarteESP32({ esp }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${esp.en_ligne ? '#00F5A055' : '#FF6B6B55'}`,
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: esp.en_ligne ? '#00F5A022' : '#FF6B6B22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {esp.en_ligne
          ? <Wifi size={20} color="#00F5A0" />
          : <WifiOff size={20} color="#FF6B6B" />
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <strong style={{ fontSize: 15 }}>{esp.label}</strong>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: esp.en_ligne ? '#00F5A022' : '#FF6B6B22',
            color: esp.en_ligne ? '#00F5A0' : '#FF6B6B',
            border: `1px solid ${esp.en_ligne ? '#00F5A055' : '#FF6B6B55'}`,
          }}>
            {esp.en_ligne ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {esp.ip && <span>IP : <strong style={{ color: 'var(--text)' }}>{esp.ip}</strong></span>}
          {esp.vu_le
            ? <span><Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />Vu {tempsRelatif(esp.vu_le)}</span>
            : <span style={{ color: '#FF6B6B' }}>Jamais vu — vérifiez la connexion</span>
          }
        </div>
      </div>
    </div>
  )
}

export default function Supervision() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur]   = useState(null)
  const [dernierRefresh, setDernierRefresh] = useState(null)

  const charger = useCallback(async () => {
    setLoading(true)
    setErreur(null)
    try {
      const d = await api.supervision()
      setData(d)
      setDernierRefresh(new Date())
    } catch (e) {
      setErreur(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    charger()
    const interval = setInterval(charger, 30000) // rafraîchissement auto toutes les 30s
    return () => clearInterval(interval)
  }, [charger])

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <p style={{ color: 'var(--slate)', margin: 0 }}>
          Mise à jour automatique toutes les 30 secondes.
          {dernierRefresh && <span> Dernière : {dernierRefresh.toLocaleTimeString('fr-FR')}</span>}
        </p>
        <button onClick={charger} disabled={loading} className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 14px' }}>
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          Actualiser
        </button>
      </div>

      {erreur && (
        <div style={{ background: '#FF6B6B22', border: '1px solid #FF6B6B55', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#FF6B6B' }}>
          {erreur}
        </div>
      )}

      {data && (
        <>
          {/* Section ESP32 */}
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate)', marginBottom: 12 }}>
            Portiques ESP32
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 36 }}>
            {data.esp32.map(esp => <CarteESP32 key={esp.portail_id} esp={esp} />)}
          </div>

          {/* Section badges */}
          <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate)', marginBottom: 12 }}>
            Badges — Batterie & Activité
          </h3>

          {data.badges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)' }}>Aucun badge enregistré.</div>
          ) : (
            <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Badge', 'Statut', 'Batterie', 'Dernière vue'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.badges.map((b, i) => (
                    <tr key={b.uuid} style={{ borderBottom: i < data.badges.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{b.nom}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: 'monospace', marginTop: 2 }}>{b.uuid.slice(0, 18)}…</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                          background: b.actif ? '#00F5A022' : 'var(--navy-light)',
                          color: b.actif ? '#00F5A0' : 'var(--slate)',
                          border: `1px solid ${b.actif ? '#00F5A055' : 'var(--border)'}`,
                        }}>
                          {b.actif ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <BatterieIndicateur pct={b.batterie_pct} />
                        {b.batterie_pct !== null && b.batterie_pct <= 20 && (
                          <div style={{ fontSize: 11, color: '#FF6B6B', marginTop: 3 }}>⚠ Pile faible</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--slate)' }}>
                        {b.derniere_vue_le
                          ? <span title={b.derniere_vue_le}>{tempsRelatif(b.derniere_vue_le)}</span>
                          : <span style={{ color: '#FF6B6B' }}>Jamais détecté</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
