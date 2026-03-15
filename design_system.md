# Design System NearGate

## Palette de couleurs
- Midnight (fond principal)   : #080E1A
- Deep Navy (fond secondaire) : #0D1B2E
- Electric (accent principal) : #00E5FF  → CTA, liens, highlights
- Access Green (accent succès): #00F5A0  → états OK, confirmations
- Slate (texte secondaire)    : #8BA3C0
- Blanc pur                   : #FFFFFF

## Typographie
- Titres / Logo : Syne, weight 800 (Google Fonts)
- Corps / UI    : DM Sans, weight 300 à 500 (Google Fonts)
- Taille base   : 16px
- Hiérarchie    : h1 2.5rem / h2 1.75rem / h3 1.25rem

## Style général
- Thème sombre par défaut (dark-first)
- Fond des cards : #0D1B2E avec bordure 1px #00E5FF à 20% d'opacité
- Border-radius  : 12px cards, 8px boutons, 6px inputs
- Ombres         : box-shadow 0 4px 24px rgba(0,229,255,0.08)

## Boutons
- Primaire   : background #00E5FF, texte #080E1A, font-weight 600
- Secondaire : border 1px #00E5FF, texte #00E5FF, background transparent
- Succès     : background #00F5A0, texte #080E1A
- Hover      : brightness(1.1) + transition 200ms ease

## Icônes
- Lucide React (stroke, pas fill)

## Badges de statut
- Pill arrondi, fond couleur à 15% opacité + texte couleur pleine

## Séparateurs
- border 1px rgba(0,229,255,0.15)

## États et feedback
- Succès  : #00F5A0
- Erreur  : #FF4D6D
- Warning : #FFB547
- Info    : #00E5FF

## Dashboard
- Sidebar  : fond #080E1A, largeur 240px
- Topbar   : fond #0D1B2E, hauteur 64px, border-bottom 1px rgba(0,229,255,0.15)
- Cards KPI: fond #0D1B2E, accent top-border 2px #00E5FF ou #00F5A0
- Tables   : lignes alternées #080E1A / #0D1B2E, hover rgba(0,229,255,0.05)

## Animations
- Transitions UI  : 200ms ease
- Entrées éléments: fadeIn + translateY(8px→0), 300ms
- Pas d'animations lourdes

## À éviter
- Pas de blanc dominant
- Pas de couleurs vives hors palette
- Pas de border-radius > 16px
- Pas de gradients sauf fond hero (Midnight → Deep Navy vertical)
