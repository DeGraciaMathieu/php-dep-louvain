# Louvain — PHP dependency community detection

Détecte des **communautés de classes** dans un graphe de dépendances PHP en appliquant l'algorithme de Louvain (Blondel et al., 2008).

Prend en entrée le JSON produit par un analyseur de dépendances PHP et produit des groupes de classes fortement couplées — utile pour identifier des modules cohérents, des violations d'architecture ou des candidats à l'extraction en packages.

---

## Installation

```bash
npm install
```

Requires Node ≥ 18.

---

## Usage

```bash
npx tsx src/index.ts [options] [input.json]
```

L'entrée peut être un fichier ou **stdin** :

```bash
cat analysis.json | npx tsx src/index.ts --format text
```

### Options

| Option | Description |
|---|---|
| `--format json` | Sortie JSON structurée **(défaut)** |
| `--format text` | Sortie texte lisible dans le terminal |
| `--format html` | Visualisation interactive (D3.js) |
| `--out <file>` | Écrit le résultat dans un fichier |
| `--internal-only` | N'inclut que les nœuds de `classes` (ignore vendor/built-in) |

### Exemples

```bash
# Rapport JSON
npx tsx src/index.ts analysis.json

# Rapport texte rapide
npx tsx src/index.ts --format text analysis.json

# Visualisation dans le navigateur
npx tsx src/index.ts --format html analysis.json --out graph.html
open graph.html

# Sans les dépendances externes (Psr\, Doctrine\, etc.)
npx tsx src/index.ts --internal-only --format text analysis.json
```

---

## Format d'entrée

JSON produit par un analyseur de dépendances PHP :

```json
{
  "meta": {
    "version": "1.0",
    "analyzed_path": "/path/to/project",
    "file_count": 42,
    "class_count": 38,
    "node_count": 95,
    "edge_count": 312
  },
  "classes": [
    {
      "fqcn": "App\\Service\\UserService",
      "type": "class",
      "file": "/path/to/UserService.php",
      "line": 12,
      "dependencies": ["App\\Repository\\UserRepository"],
      "dependants":   ["App\\Controller\\UserController"]
    }
  ],
  "edges": [
    {
      "source":     "App\\Service\\UserService",
      "target":     "App\\Repository\\UserRepository",
      "type":       "param_type",
      "confidence": "certain",
      "file":       "/path/to/UserService.php",
      "line":       23,
      "metadata":   {}
    }
  ]
}
```

- **`classes`** — nœuds internes (votre code). Ils apparaissent distincts des nœuds externes dans tous les formats de sortie.
- **`edges`** — arêtes dirigées (A dépend de B). L'algorithme les traite comme **non-dirigées**.
- **`confidence`** — influence le poids de l'arête :

| confidence | poids |
|---|---|
| `certain` | 1.00 |
| `high` | 0.75 |
| `medium` | 0.50 |
| `low` | 0.25 |

Plusieurs arêtes entre la même paire de nœuds sont **fusionnées** (somme des poids).

---

## Format de sortie JSON

```json
{
  "meta": {
    "analyzed_path": "/path/to/project",
    "modularity": 0.4213,
    "community_count": 5,
    "node_count": 95,
    "internal_node_count": 38
  },
  "communities": [
    {
      "id": 0,
      "namespace": "App\\Order",
      "size": 8,
      "internal_count": 6,
      "density": 0.6,
      "members": [
        "App\\Order\\OrderService",
        "App\\Order\\OrderRepository"
      ],
      "external_members": [
        "Doctrine\\ORM\\EntityManagerInterface"
      ],
      "types": ["class"]
    }
  ]
}
```

| Champ | Description |
|---|---|
| `modularity` | Score Q de Newman-Girvan — plus c'est proche de 1, plus les communautés sont bien séparées. Au-dessus de 0.3 = structure significative. |
| `namespace` | Plus long préfixe de namespace commun aux membres internes |
| `density` | Arêtes internes réelles / arêtes internes possibles (0–1) |
| `members` | Classes internes de la communauté |
| `external_members` | Nœuds vendor/built-in présents dans la communauté |

Les communautés sont **triées par taille décroissante**.

---

## Visualisation HTML

```bash
npx tsx src/index.ts --format html analysis.json --out graph.html
open graph.html
```

Le fichier HTML généré est **autonome** (données embarquées, D3.js via CDN).

### Interface

**Panneau gauche** — liste des communautés. Cliquer sur une carte déroule ses membres et met la communauté en surbrillance dans le graphe.

**Graphe principal** — simulation de forces D3.js avec :
- Drag individuel des nœuds
- Zoom et pan (molette / pinch)
- Tooltip au survol (FQCN complet + type + communauté)

**Encodage visuel**

| Élément | Signification |
|---|---|
| Couleur du nœud | Communauté d'appartenance |
| Taille du nœud | Grand = interne, petit = externe/vendor |
| Opacité du nœud | Plein = interne, transparent = externe |
| Épaisseur de l'arête | Poids (confidence) |
| Polygone coloré | Frontière convexe de la communauté |

**Boutons**

| Bouton | Action |
|---|---|
| `External nodes` | Masquer/afficher les nœuds vendor et built-in |
| `Labels` | Masquer/afficher les noms courts |
| `Hulls` | Masquer/afficher les polygones de communauté |
| `⟳ Reset` | Recentrer le graphe et effacer les highlights |

---

## Algorithme

Implémentation de l'algorithme de Louvain multi-niveaux (Blondel et al., 2008).

**Phase 1 — Optimisation de la modularité**

Pour chaque nœud `i`, on calcule le gain ΔQ de le déplacer vers chaque communauté voisine :

```
ΔQ = k_{i,C} / m  −  sigmaTot[C] · k_i / (2m²)
```

- `k_{i,C}` — somme des poids des arêtes de `i` vers la communauté `C`
- `k_i` — degré pondéré de `i`
- `sigmaTot[C]` — somme des degrés pondérés des nœuds de `C`
- `m` — somme totale des poids d'arêtes (constante)

On itère jusqu'à ce qu'aucun nœud ne bouge.

**Phase 2 — Agrégation**

Chaque communauté devient un super-nœud. Les arêtes intra-communauté se transforment en self-loops (encodés dans le degré pour préserver `Σk = 2m`). On recommence la Phase 1 sur ce super-graphe.

Les deux phases alternent jusqu'à convergence (max 15 niveaux).

**Propriétés**

- Complexité : O(n log n) en pratique
- Déterministe pour un ordre de parcours fixe
- `m` est préservé à travers tous les niveaux d'agrégation

---

## Structure du projet

```
src/
├── types.ts      — Interfaces TypeScript pour le format d'entrée
├── graph.ts      — Construction du graphe depuis le JSON
├── louvain.ts    — Algorithme (Phase 1 + Phase 2 + calcul de modularité)
├── visualize.ts  — Générateur HTML/D3.js
└── index.ts      — CLI et formatters de sortie
```
