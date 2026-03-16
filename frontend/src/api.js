const BASE = '/api'

function token() {
  return localStorage.getItem('ng_token')
}

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    ...extra,
  }
}

async function req(method, path, body) {
  const opts = { method, headers: headers() }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(BASE + path, opts)
  if (res.status === 401) {
    localStorage.removeItem('ng_token')
    window.location.href = '/login'
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erreur serveur' }))
    throw new Error(err.detail || 'Erreur')
  }
  return res.json()
}

export const api = {
  // Auth
  login: async (email, mdp) => {
    const body = new URLSearchParams({ username: email, password: mdp })
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error('Email ou mot de passe incorrect')
    const data = await res.json()
    localStorage.setItem('ng_token', data.access_token)
    localStorage.setItem('ng_user', JSON.stringify({ nom: data.nom, role: data.role }))
    return data
  },
  logout: () => {
    localStorage.removeItem('ng_token')
    localStorage.removeItem('ng_user')
  },
  me: () => req('GET', '/auth/me'),

  // Badges
  badges: () => req('GET', '/badges'),
  ajouterBadge: (data) => req('POST', '/badges', data),
  modifierBadge: (uuid, data) => req('PATCH', `/badges/${uuid}`, data),
  supprimerBadge: (uuid) => req('DELETE', `/badges/${uuid}`),

  // États
  etats: () => req('GET', '/etats'),
  libererBadge: (uuid) => req('DELETE', `/etats/${uuid}`),

  // Événements
  evenements: (limite = 100, direction) => {
    const q = direction ? `?direction=${direction}&limite=${limite}` : `?limite=${limite}`
    return req('GET', `/evenements${q}`)
  },

  // Config
  config: () => req('GET', '/config'),
  modifierConfig: (cle, valeur) => req('PUT', `/config/${cle}`, { valeur }),

  // Utilisateurs
  utilisateurs: () => req('GET', '/utilisateurs'),
  creerUtilisateur: (data) => req('POST', '/utilisateurs', data),
  supprimerUtilisateur: (id) => req('DELETE', `/utilisateurs/${id}`),

  // Radar BLE
  radarScan: (duree = 5) => req('GET', `/radar/scan?duree=${duree}`),

  // Supervision
  supervision: () => req('GET', '/supervision'),

  // Commande manuelle
  ouvrirPortail: (portailId) => req('POST', `/portail/${portailId}/ouvrir`),

  // Import CSV (géré directement dans ImportCSV.jsx via fetch natif)
}
