import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Battery, BatteryLow, Clock, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../api'

function tempsRelatif(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000)
  if (diff < 60)   return `il y a ${diff}s`
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
  return `il y a ${Math.floor(diff / 86400)}j`
}

function StatutPill({ ok, labelOk, labelKo }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
      background: ok ? '#00F5A022' : '#FF6B6B22',
      color:      ok ? '#00F5A0'   : '#FF6B6B',
      border:     `1px solid ${ok ? '#00F5A055' : '#FF6B6B55'}`,
    }}>
      {ok ? labelOk : labelKo}
    </span>
  )
}

export default function Connectivite() {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [erreur,    setErreur]    = useState(null)
  const [refresh,   setRefresh]   = useState(null)
  const [distances, setDistances] = useState({})

  const charger = useCallback(async () => {
    setLoading(true); setErreur(null)
    try {
      const d = await api.supervision()
      setData(d)
      setRefresh(new Date())
    } catch (e) {
      setErreur(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    charger()
    const t = setInterval(charger, 30000)
    return () => clearInterval(t)
  }, [charger])

  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'distance' && msg.data) {
          setDistances(prev => ({ ...prev, [msg.data.mac]: msg.data.distance_cm }))
        }
      } catch {}
    }
    return () => es.close()
  }, [])

  return (
    <div style={{ maxWidth: 960 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <p style={{ color: 'var(--slate)', margin: 0, fontSize: 13 }}>
          Mise à jour automatique toutes les 30s.
          {refresh && <span> Dernière : {refresh.toLocaleTimeString('fr-FR')}</span>}
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

      {data && (<>

        {/* ── NearGate Radars ───────────────────────────────────────── */}
        <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate)', marginBottom: 12 }}>
          NearGate Radars
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginBottom: 36 }}>
          {data.esp32.map(esp => (
            <div key={esp.mac} style={{
              background: 'var(--card)',
              border: `1px solid ${esp.en_ligne ? '#00F5A055' : '#FF6B6B55'}`,
              borderRadius: 12, padding: '18px 20px',
            }}>
              {/* Titre + statut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: esp.en_ligne ? '#00F5A022' : '#FF6B6B22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {esp.en_ligne ? <Wifi size={18} color="#00F5A0" /> : <WifiOff size={18} color="#FF6B6B" />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{esp.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: 'monospace' }}>{esp.mac}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <StatutPill ok={esp.en_ligne} labelOk="En ligne" labelKo="Hors ligne" />
                </div>
              </div>

              {/* Détails */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                {esp.ip && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--slate)' }}>Adresse IP</span>
                    <strong style={{ fontFamily: 'monospace' }}>{esp.ip}</strong>
                  </div>
                )}
                {esp.firmware_version && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--slate)' }}>Firmware</span>
                    <strong>v{esp.firmware_version}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate)' }}>Capteur véhicule</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {esp.capteur_actif
                      ? <><CheckCircle size={13} color="#00F5A0" /> <span style={{ color: '#00F5A0', fontWeight: 600 }}>Actif</span></>
                      : <><XCircle    size={13} color="#FFB347" /> <span style={{ color: '#FFB347', fontWeight: 600 }}>Bypassé</span></>
                    }
                  </span>
                </div>
                {esp.capteur_actif && (() => {
                  const dist = distances[esp.mac] ?? esp.distance_cm
                  return dist != null ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--slate)' }}>Distance mesurée</span>
                      <strong style={{ color: dist < 200 ? '#00F5A0' : 'var(--slate)' }}>
                        {dist >= 999 ? 'Aucun obstacle' : `${dist} cm`}
                      </strong>
                    </div>
                  ) : null
                })()}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--slate)' }}>Dernier contact</span>
                  <span style={{ color: esp.en_ligne ? 'var(--text)' : '#FF6B6B' }}>
                    {esp.vu_le ? tempsRelatif(esp.vu_le) : 'Jamais vu'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Badges ───────────────────────────────────────────────── */}
        <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate)', marginBottom: 12 }}>
          Badges — Activité & Batterie
        </h3>

        {data.badges.length === 0
          ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)' }}>Aucun badge enregistré.</div>
          : (
            <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Badge', 'Statut', 'Batterie', 'Dernière vue'].map(h => (
                      <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, color: 'var(--slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.badges.map((b, i) => {
                    const dernier = b.derniere_vue_le
                    const diffSec = dernier ? Math.floor((Date.now() - new Date(dernier.replace(' ', 'T')).getTime()) / 1000) : null
                    const recente = diffSec !== null && diffSec < 300  // vu il y a < 5 min
                    return (
                      <tr key={b.uuid} style={{ borderBottom: i < data.badges.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{b.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--slate)', fontFamily: 'monospace', marginTop: 2 }}>{b.uuid.slice(0, 20)}…</div>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <StatutPill ok={b.actif} labelOk="Actif" labelKo="Désactivé" />
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          {b.batterie_pct != null ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: 14,
                              color: b.batterie_pct > 50 ? '#00F5A0' : b.batterie_pct > 20 ? '#FFB347' : '#FF6B6B' }}>
                              {b.batterie_pct <= 20 ? <BatteryLow size={14} /> : <Battery size={14} />}
                              {b.batterie_pct}%
                            </span>
                          ) : <span style={{ color: 'var(--slate)' }}>—</span>}
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 13 }}>
                          {dernier ? (
                            <span style={{ color: recente ? '#00F5A0' : 'var(--slate)' }}>
                              <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                              {tempsRelatif(dernier)}
                            </span>
                          ) : <span style={{ color: '#FF6B6B' }}>Jamais détecté</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </>)}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
