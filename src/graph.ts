import type { InputData } from './types.js'

/** Confidence → edge weight */
export const CONFIDENCE_WEIGHT: Record<string, number> = {
  certain: 1.0,
  high:    0.75,
  medium:  0.5,
  low:     0.25,
}

export interface Adj {
  to: number
  weight: number
}

export interface Graph {
  n: number
  labels: string[]           // index → fqcn
  index: Map<string, number> // fqcn → index
  isInternal: boolean[]      // true if the node comes from data.classes
  adj: Adj[][]               // undirected adjacency list (no self-loops)
  k: Float64Array            // weighted degree of each node
  m: number                  // total edge weight (each undirected edge counted once)
}

/**
 * Build an undirected, weighted graph from the dependency-analysis JSON.
 *
 * Directed edges (source → target) are treated as undirected; parallel edges
 * between the same pair are merged by summing their weights.
 *
 * @param data        Parsed input JSON
 * @param internalOnly  When true, only nodes that appear in data.classes are
 *                      included; external/vendor nodes are ignored entirely.
 */
export function buildGraph(data: InputData, internalOnly = false): Graph {
  const internalSet = new Set(data.classes.map(c => c.fqcn))

  // Collect all node labels
  const nodeSet = new Set<string>(internalSet)
  if (!internalOnly) {
    for (const e of data.edges) {
      nodeSet.add(e.source)
      nodeSet.add(e.target)
    }
  }

  const labels = Array.from(nodeSet)
  const index  = new Map(labels.map((l, i) => [l, i]))
  const n      = labels.length
  const isInternal = labels.map(l => internalSet.has(l))

  const adj: Adj[][] = Array.from({ length: n }, () => [])
  const k = new Float64Array(n)
  let m = 0

  // Merge parallel edges: same undirected pair → summed weight
  const edgeWeights = new Map<string, number>()

  for (const e of data.edges) {
    const s = index.get(e.source)
    const t = index.get(e.target)
    if (s === undefined || t === undefined || s === t) continue

    const w   = CONFIDENCE_WEIGHT[e.confidence] ?? 0.5
    const a   = Math.min(s, t)
    const b   = Math.max(s, t)
    const key = `${a},${b}`
    edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + w)
  }

  for (const [key, w] of edgeWeights) {
    const [a, b] = key.split(',').map(Number)
    adj[a].push({ to: b, weight: w })
    adj[b].push({ to: a, weight: w })
    k[a] += w
    k[b] += w
    m    += w
  }

  return { n, labels, index, isInternal, adj, k, m }
}
