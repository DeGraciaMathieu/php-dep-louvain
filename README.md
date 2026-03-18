# Louvain — PHP dependency community detection

Detects **class communities** in a PHP dependency graph by applying the Louvain algorithm (Blondel et al., 2008).

Takes as input the JSON produced by [php-dep](https://github.com/DeGraciaMathieu/php-dep) and outputs groups of tightly coupled classes — useful for identifying cohesive modules, architecture violations, or candidates for package extraction.

---

## Installation

```bash
npm install
```

Requires Node ≥ 22.

---

## Usage

```bash
npx tsx src/index.ts [options] [input.json]
```

Input can be a file or **stdin**:

```bash
cat analysis.json | npx tsx src/index.ts --format text
```

### Options

| Option | Description |
|---|---|
| `--format json` | Structured JSON output **(default)** |
| `--format text` | Human-readable terminal output |
| `--format html` | Interactive visualization (D3.js) |
| `--out <file>` | Write result to a file |
| `--internal-only` | Only include nodes from `classes` (ignores vendor/built-in) |

### Examples

```bash
# JSON report
npx tsx src/index.ts analysis.json

# Quick text report
npx tsx src/index.ts --format text analysis.json

# Browser visualization
npx tsx src/index.ts --format html analysis.json --out graph.html
open graph.html

# Without external dependencies (Psr\, Doctrine\, etc.)
npx tsx src/index.ts --internal-only --format text analysis.json
```

---

## Input format

JSON produced by [php-dep](https://github.com/DeGraciaMathieu/php-dep), a PHP dependency analyser:

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

- **`classes`** — internal nodes (your code). They appear distinct from external nodes in all output formats.
- **`edges`** — directed edges (A depends on B). The algorithm treats them as **undirected**.
- **`confidence`** — influences edge weight:

| confidence | weight |
|---|---|
| `certain` | 1.00 |
| `high` | 0.75 |
| `medium` | 0.50 |
| `low` | 0.25 |

Multiple edges between the same pair of nodes are **merged** (sum of weights).

---

## JSON output format

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

| Field | Description |
|---|---|
| `modularity` | Newman-Girvan Q score — closer to 1 means better-separated communities. Above 0.3 = significant structure. |
| `namespace` | Longest common namespace prefix among internal members |
| `density` | Actual internal edges / possible internal edges (0–1) |
| `members` | Internal classes in the community |
| `external_members` | Vendor/built-in nodes present in the community |

Communities are **sorted by descending size**.

---

## HTML visualization

```bash
npx tsx src/index.ts --format html analysis.json --out graph.html
open graph.html
```

The generated HTML file is **self-contained** (embedded data, D3.js via CDN).

### Interface

**Left panel** — list of communities. Clicking a card expands its members and highlights the community in the graph.

**Main graph** — D3.js force simulation with:
- Individual node dragging
- Zoom and pan (scroll wheel / pinch)
- Hover tooltip (full FQCN + type + community)

**Visual encoding**

| Element | Meaning |
|---|---|
| Node color | Community membership |
| Node size | Large = internal, small = external/vendor |
| Node opacity | Solid = internal, transparent = external |
| Edge thickness | Weight (confidence) |
| Colored polygon | Convex hull of the community |

**Buttons**

| Button | Action |
|---|---|
| `External nodes` | Toggle vendor and built-in nodes |
| `Labels` | Toggle short name labels |
| `Hulls` | Toggle community polygons |
| `⟳ Reset` | Re-center the graph and clear highlights |

---

## Algorithm

Implementation of the multi-level Louvain algorithm (Blondel et al., 2008).

**Phase 1 — Modularity optimisation**

For each node `i`, compute the modularity gain ΔQ of moving it to each neighbouring community:

```
ΔQ = k_{i,C} / m  −  sigmaTot[C] · k_i / (2m²)
```

- `k_{i,C}` — sum of edge weights from `i` to community `C`
- `k_i` — weighted degree of `i`
- `sigmaTot[C]` — sum of weighted degrees of nodes in `C`
- `m` — total sum of edge weights (constant)

Iterate until no node moves.

**Phase 2 — Aggregation**

Each community becomes a super-node. Intra-community edges become self-loops (encoded in the degree to preserve `Σk = 2m`). Phase 1 restarts on this super-graph.

Both phases alternate until convergence (max 15 levels).

**Properties**

- Complexity: O(n log n) in practice
- Deterministic for a fixed traversal order
- `m` is preserved across all aggregation levels

---

## Project structure

```
src/
├── types.ts      — TypeScript interfaces for the input format
├── graph.ts      — Graph construction from JSON
├── louvain.ts    — Algorithm (Phase 1 + Phase 2 + modularity calculation)
├── visualize.ts  — HTML/D3.js generator
└── index.ts      — CLI and output formatters
```
