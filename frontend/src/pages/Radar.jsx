import { useState } from 'react'
import { Wifi, WifiOff, Plus, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { api } from '../api'

function RssiBar({ rssi }) {
  // rssi typiquement entre -100 (très faible) et -30 (très fort)
  const pct = Math.max(0, Math.min(100, ((rssi + 100) / 70) * 100))
  const color = pct > 60 ? '#00F5A0' : pct > 30 ? '#00E5FF' : '#FF6B6B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 80, height: 6, background: 'var(--navy-light)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}>{rssi} dBm</span>
    </div>
  )
}

export default function Radar() {
  const [scan, setScan]       = useState(null)   // { appareils, total }
  const [loading, setLoading] = useState(false)
  const [duree, setDuree]     = useState(5)
  const [ajouts, setAjouts]   = useState({})     // uuid → 'loading' | 'ok' | 'err'
  const [erreur, setErreur]   = useState(null)

  async function lancer() {
    setLoading(true)
    setErreur(null)
    setScan(null)
    setAjouts({})
    try {
      const data = await api.radarScan(duree)
      setScan(data)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function ajouter(appareil) {
    const uuid = appareil.uuid_ibeacon
    setAjouts(a => ({ ...a, [uuid]: 'loading' }))
    try {
      await api.ajouterBadge({
        uuid,
        nom: appareil.nom_ble !== 'Inconnu' ? appareil.nom_ble : `Badge ${uuid.slice(0, 8)}`,
        actif: true,
      })
      setAjouts(a => ({ ...a, [uuid]: 'ok' }))
      // Mettre à jour l'état local
      setScan(s => ({
        ...s,
        appareils: s.appareils.map(ap =>
          ap.uuid_ibeacon === uuid ? { ...ap, enregistre: true } : ap
        ),
      }))
    } catch (e) {
      setAjouts(a => ({ ...a, [uuid]: 'err:' + e.message }))
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <p style={{ color: 'var(--slate)', marginBottom: 24 }}>
        Scanne les appareils Bluetooth autour du Raspberry Pi et identifie les badges iBeacon.
      </p>

      {/* Contrôles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <label style={{ color: 'var(--slate)', fontSize: 14 }}>
          Durée du scan :
          <select
            value={duree}
            onChange={e => setDuree(Number(e.target.value))}
            disabled={loading}
            style={{
              marginLeft: 8,
              background: 'var(--navy-light)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            <option value={3}>3 secondes</option>
            <option value={5}>5 secondes</option>
            <option value={10}>10 secondes</option>
            <option value={15}>15 secondes</option>
          </select>
        </label>

        <button
          onClick={lancer}
          disabled={loading}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {loading
            ? <><Loader size={16} className="spin" /> Scan en cours…</>
            : <><Wifi size={16} /> Lancer le scan</>}
        </button>
      </div>

      {/* Erreur */}
      {erreur && (
        <div style={{
          background: '#FF6B6B22', border: '1px solid #FF6B6B55',
          borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          color: '#FF6B6B', fontSize: 14,
        }}>
          <strong>Erreur :</strong> {erreur}
        </div>
      )}

      {/* Animation pendant le scan */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--slate)' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            border: '2px solid var(--electric)',
            margin: '0 auto 16px',
            animation: 'pulse 1.5s ease-in-out infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wifi size={32} color="var(--electric)" />
          </div>
          <p>Recherche des appareils BLE à proximité…</p>
        </div>
      )}

      {/* Résultats */}
      {scan && !loading && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {scan.total} appareil{scan.total !== 1 ? 's' : ''} détecté{scan.total !== 1 ? 's' : ''}
            </h3>
            <span style={{ fontSize: 13, color: 'var(--slate)' }}>
              {scan.appareils.filter(a => a.uuid_ibeacon).length} iBeacon(s)
            </span>
          </div>

          {scan.total === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              color: 'var(--slate)', background: 'var(--navy-light)',
              borderRadius: 10, border: '1px dashed var(--border)',
            }}>
              <WifiOff size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
              <p>Aucun appareil Bluetooth trouvé dans la zone.</p>
              <p style={{ fontSize: 13 }}>Assurez-vous que le Bluetooth est actif et que des badges sont à proximité.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scan.appareils.map((ap) => (
                <div key={ap.adresse} style={{
                  background: 'var(--card)',
                  border: `1px solid ${ap.uuid_ibeacon ? 'var(--electric)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  opacity: ap.uuid_ibeacon ? 1 : 0.65,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {ap.uuid_ibeacon
                        ? <span style={{ fontSize: 10, background: '#00E5FF22', color: 'var(--electric)', border: '1px solid var(--electric)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>iBeacon</span>
                        : <span style={{ fontSize: 10, background: 'var(--navy-light)', color: 'var(--slate)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>BLE</span>
                      }
                      <strong style={{ fontSize: 14 }}>
                        {ap.nom_ble !== 'Inconnu' ? ap.nom_ble : ap.adresse}
                      </strong>
                      {ap.enregistre && (
                        <span style={{ fontSize: 12, color: '#00F5A0' }}>
                          ✓ {ap.nom_badge}
                        </span>
                      )}
                    </div>

                    {ap.uuid_ibeacon && (
                      <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 4, fontFamily: 'monospace' }}>
                        {ap.uuid_ibeacon}
                      </div>
                    )}
                    {ap.uuid_ibeacon && (ap.major !== null || ap.minor !== null) && (
                      <div style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <span>Major : <strong style={{ color: 'var(--text)' }}>{ap.major ?? '—'}</strong></span>
                        <span>Minor : <strong style={{ color: 'var(--text)' }}>{ap.minor ?? '—'}</strong></span>
                        {ap.batterie !== null && ap.batterie !== undefined && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            color: ap.batterie > 50 ? '#00F5A0' : ap.batterie > 20 ? '#FFB347' : '#FF6B6B',
                            fontWeight: 600,
                          }}>
                            🔋 {ap.batterie}%
                          </span>
                        )}
                      </div>
                    )}

                    <RssiBar rssi={ap.rssi} />
                  </div>

                  {/* Bouton ajouter */}
                  <div style={{ minWidth: 120, textAlign: 'right' }}>
                    {ap.uuid_ibeacon && !ap.enregistre && (
                      <>
                        {!ajouts[ap.uuid_ibeacon] && (
                          <button
                            onClick={() => ajouter(ap)}
                            className="btn-primary"
                            style={{ fontSize: 13, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Plus size={14} /> Ajouter
                          </button>
                        )}
                        {ajouts[ap.uuid_ibeacon] === 'loading' && (
                          <span style={{ fontSize: 13, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <Loader size={14} className="spin" /> Ajout…
                          </span>
                        )}
                        {ajouts[ap.uuid_ibeacon] === 'ok' && (
                          <span style={{ fontSize: 13, color: '#00F5A0', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <CheckCircle size={14} /> Ajouté
                          </span>
                        )}
                        {ajouts[ap.uuid_ibeacon]?.startsWith('err:') && (
                          <span style={{ fontSize: 12, color: '#FF6B6B', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <AlertCircle size={14} /> {ajouts[ap.uuid_ibeacon].slice(4)}
                          </span>
                        )}
                      </>
                    )}
                    {ap.enregistre && (
                      <span style={{
                        fontSize: 12,
                        color: ap.actif ? '#00F5A0' : 'var(--slate)',
                        background: ap.actif ? '#00F5A022' : 'var(--navy-light)',
                        border: `1px solid ${ap.actif ? '#00F5A055' : 'var(--border)'}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                      }}>
                        {ap.actif ? 'Actif' : 'Désactivé'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
