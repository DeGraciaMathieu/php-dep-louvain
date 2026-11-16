# php-dep-louvain — PHP dependency community detection

https://github.com/user-attachments/assets/4e5132a0-beab-41a0-80c6-fd3374a9027a

Detects **class communities** in a PHP project by applying the Louvain algorithm (Blondel et al., 2008) to its dependency graph.

The dependency graph is extracted by [php-dep](https://github.com/DeGraciaMathieu/php-dep), used as a library: point the tool at a PHP directory and it outputs groups of tightly coupled classes — useful for identifying cohesive modules, architecture violations, or candidates for package extraction.

---

## Installation

Download the PHAR of the latest release, it holds everything it needs, php-dep included:

```bash
wget https://github.com/DeGraciaMathieu/php-dep-louvain/releases/latest/download/php-dep-louvain.phar
php php-dep-louvain.phar --help
```

Requires PHP ≥ 8.2.

Or run it from the sources, where php-dep is installed by Composer straight from its GitHub repository:

```bash
git clone https://github.com/DeGraciaMathieu/php-dep-louvain.git
cd php-dep-louvain
composer install
bin/php-dep-louvain --help
```

---

## Usage

```bash
php php-dep-louvain.phar [options] [path]
```

From the sources, run `bin/php-dep-louvain` instead.

`path` is the PHP directory or file to analyze, `.` by default.

### Options

| Option | Description |
|---|---|
| `--format json` | Structured JSON output **(default)** |
| `--format text` | Human-readable terminal output |
| `--format html` | Interactive visualization (D3.js) |
| `--out <file>` | Write result to a file |
| `--internal-only` | Only include classes declared in the project (ignores vendor/built-in) |
| `--max-levels <n>` | Maximum number of Louvain phase cycles (default: 15) |

### Examples

```bash
# JSON report
php php-dep-louvain.phar src/

# Quick text report
php php-dep-louvain.phar --format text src/

# Browser visualization
php php-dep-louvain.phar --format html src/ --out graph.html
open graph.html

# Without external dependencies (Psr\, Doctrine\, etc.)
php php-dep-louvain.phar --internal-only --format text src/
```

---

## Graph construction

- **Nodes** — the classes declared in the project, plus the external classes they use (vendor, built-in), unless `--internal-only`.
- **Edges** — each dependency found by php-dep (A uses B) is an edge of weight 1. The algorithm treats them as **undirected**: when A uses B and B uses A, the pair weighs 2.

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
      "cohesion": 0.75,
      "members": [
        "App\\Order\\OrderService",
        "App\\Order\\OrderRepository"
      ],
      "external_members": [
        "Doctrine\\ORM\\EntityManagerInterface"
      ]
    }
  ]
}
```

| Field | Description |
|---|---|
| `modularity` | Newman-Girvan Q score — closer to 1 means better-separated communities. Above 0.3 = significant structure. |
| `namespace` | Longest namespace shared by more than half of the internal members: a class from elsewhere does not hide it |
| `density` | Actual internal edges / possible internal edges (0–1) |
| `cohesion` | Share of the dependencies from or to the community that stay inside it (0–1) |
| `members` | Internal classes in the community |
| `external_members` | Vendor/built-in nodes present in the community |

Communities are **sorted by descending size**.

---

## HTML visualization

```bash
php php-dep-louvain.phar --format html src/ --out graph.html
open graph.html
```

The generated HTML file is **self-contained** (embedded data, D3.js via CDN).

### Interface

**Left panel** — list of communities, with their cohesion as a bar. Clicking a card expands its members and highlights the community in the graph. The search field keeps the communities holding a matching class and shows where it lives.

**Main graph** — one node per community, in a D3.js force simulation:
- Each node is named after its dominant namespace, numbered when two communities share it
- A ring around each node shows its cohesion
- An arrow goes from a community to the one it depends on, as thick as the number of class dependencies
- Clicking an arrow lists the class dependencies it is made of, in both directions, and flags a cycle
- Communities of one class without any dependency are grouped into a single `Isolated` node
- Node dragging, zoom and pan, hover tooltip

**Right panel** — the project tree, each class colored by its community. A class whose community differs from the one most classes of its folder belong to is flagged as misplaced, and `Misplaced classes only` keeps only those.

**Buttons**

| Button | Action |
|---|---|
| `Group isolated` | Group or show one by one the communities of one class without any dependency |
| `Labels` | Toggle node labels |
| `⟳ Reset` | Re-center the graph and clear the selection |

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

Both phases alternate until convergence (configurable via `--max-levels`, default 15).

**Properties**

- Complexity: O(n log n) in practice
- Deterministic for a fixed traversal order
- `m` is preserved across all aggregation levels

---

## Project structure

```
bin/php-dep-louvain           — CLI entry-point
src/
├── Console/Application.php   — Argument parsing, runs php-dep then Louvain
├── Graph/                    — Weighted graph built from the php-dep analysis
├── Louvain/Louvain.php       — Algorithm (Phase 1 + Phase 2 + modularity calculation)
├── Report/ReportBuilder.php  — Community description (namespace, density, members)
└── Output/                   — Text and HTML renderers
resources/graph.html          — HTML/D3.js template
box.json                      — PHAR build, attached to each release by .github/workflows/phar.yml
```
