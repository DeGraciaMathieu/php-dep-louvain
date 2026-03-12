/**
 * Louvain community-detection algorithm (Blondel et al., 2008).
 *
 * Works in two alternating phases:
 *   Phase 1 – Modularity optimisation: greedily move each node to the
 *              neighbour community that yields the largest ΔQ > 0. Repeat
 *              until no node moves.
 *   Phase 2 – Graph aggregation: collapse each community into a super-node,
 *              preserving total edge weight and node degrees.
 *
 * The two phases repeat until no improvement is found or the graph cannot
 * be compressed further.
 *
 * Modularity gain of moving isolated node i into community C:
 *   ΔQ = k_{i,C} / m  −  sigmaTot[C] · k_i / (2m²)
 *
 * where
 *   k_{i,C}     = sum of edge weights from i to nodes in C
 *   k_i         = weighted degree of i
 *   sigmaTot[C] = sum of weighted degrees of all nodes in C
 *   m           = total edge weight (constant throughout)
 */

import type { Graph, Adj } from './graph.js'

// ---------------------------------------------------------------------------
// Phase 1 – Modularity optimisation
// ---------------------------------------------------------------------------

interface Phase1State {
  community: Int32Array   // community[node] = community id
  sigmaTot: Float64Array  // Σ k_i for all i in each community
}

function initPhase1(g: Graph): Phase1State {
  const community = new Int32Array(g.n)
  const sigmaTot  = new Float64Array(g.n)
  for (let i = 0; i < g.n; i++) {
    community[i] = i
    sigmaTot[i]  = g.k[i]
  }
  return { community, sigmaTot }
}

/** Modularity gain of adding isolated node i to community C. */
function deltaQ(kIn: number, sigmaTot: number, ki: number, m: number): number {
  return kIn / m - (sigmaTot * ki) / (2 * m * m)
}

/**
 * Run Phase 1 on graph g, mutating state in place.
 * Returns true if at least one node moved to a different community.
 */
function runPhase1(g: Graph, state: Phase1State): boolean {
  const { community, sigmaTot } = state
  const { adj, k, m, n }       = g

  let anyChange = false
  let changed   = true

  while (changed) {
    changed = false

    for (let i = 0; i < n; i++) {
      const ci = community[i]
      const ki = k[i]

      // Edges from i to its current community (before removal)
      let kIn_ci = 0
      for (const { to, weight } of adj[i]) {
        if (community[to] === ci) kIn_ci += weight
      }

      // Remove i from ci
      sigmaTot[ci] -= ki
      community[i]  = -1

      // Collect neighbour communities and edge weights from i to each
      const nbComm = new Map<number, number>()
      for (const { to, weight } of adj[i]) {
        const c = community[to]
        if (c >= 0) nbComm.set(c, (nbComm.get(c) ?? 0) + weight)
      }
      // Always consider returning to the original community
      if (!nbComm.has(ci)) nbComm.set(ci, kIn_ci)

      // Find the community with the best modularity gain
      let bestC  = ci
      let bestDQ = deltaQ(nbComm.get(ci) ?? 0, sigmaTot[ci], ki, m)

      for (const [c, kIn] of nbComm) {
        if (c === ci) continue
        const dq = deltaQ(kIn, sigmaTot[c], ki, m)
        if (dq > bestDQ) { bestDQ = dq; bestC = c }
      }

      // Place i in the best community
      sigmaTot[bestC] += ki
      community[i]     = bestC

      if (bestC !== ci) { changed = true; anyChange = true }
    }
  }

  return anyChange
}

// ---------------------------------------------------------------------------
// Phase 2 – Graph aggregation
// ---------------------------------------------------------------------------

/**
 * Collapse each community in `community` into a super-node.
 *
 * Key invariants preserved across levels:
 *   • m stays equal to the original graph's total edge weight
 *   • k[super-node] = Σ k[original nodes in community]
 *     (captures both intra- and inter-community edges, keeping Σk = 2m)
 *   • Only inter-community edges appear in adj (intra edges → self-loops,
 *     already encoded in the super-node's elevated degree)
 */
function buildSuperGraph(
  g: Graph,
  community: Int32Array,
): { sg: Graph; nodeMap: Int32Array } {
  // Compact community ids to 0 … nc-1
  const remap = new Map<number, number>()
  for (let i = 0; i < g.n; i++) {
    if (!remap.has(community[i])) remap.set(community[i], remap.size)
  }

  const nc      = remap.size
  const nodeMap = Int32Array.from({ length: g.n }, (_, i) => remap.get(community[i])!)

  // Super-node degrees = sum of original node degrees (preserves Σk = 2m)
  const sk = new Float64Array(nc)
  for (let i = 0; i < g.n; i++) sk[nodeMap[i]] += g.k[i]

  // Aggregate inter-community edges (sum weights for each undirected pair)
  const interEdges = new Map<number, number>()
  for (let i = 0; i < g.n; i++) {
    const ci = nodeMap[i]
    for (const { to, weight } of g.adj[i]) {
      if (to <= i) continue         // skip the reverse half to avoid double-counting
      const cj = nodeMap[to]
      if (ci === cj) continue       // intra-community → already in sk via self-loop
      const a   = Math.min(ci, cj)
      const b   = Math.max(ci, cj)
      interEdges.set(a * nc + b, (interEdges.get(a * nc + b) ?? 0) + weight)
    }
  }

  const sadj: Adj[][] = Array.from({ length: nc }, () => [])
  for (const [key, w] of interEdges) {
    const a = Math.floor(key / nc)
    const b = key % nc
    sadj[a].push({ to: b, weight: w })
    sadj[b].push({ to: a, weight: w })
  }

  const sg: Graph = {
    n:          nc,
    labels:     Array.from({ length: nc }, (_, i) => String(i)),
    index:      new Map(Array.from({ length: nc }, (_, i) => [String(i), i] as [string, number])),
    isInternal: new Array(nc).fill(true),
    adj:        sadj,
    k:          sk,
    m:          g.m,  // total weight is invariant across levels
  }

  return { sg, nodeMap }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the multi-level Louvain algorithm on `graph`.
 * Returns a compact community assignment for each node (0-indexed, dense).
 */
export function louvain(graph: Graph, maxLevels = 15): Int32Array {
  let g = graph

  // hierarchy[i] = index of node i in the current-level graph
  let hierarchy: Int32Array | null = null
  let finalComm = Int32Array.from({ length: graph.n }, (_, i) => i)

  for (let level = 0; level < maxLevels; level++) {
    const state    = initPhase1(g)
    const improved = runPhase1(g, state)

    // Map current-level communities back to original node indices
    const currComm = state.community
    if (hierarchy === null) {
      finalComm = currComm.slice()
    } else {
      for (let i = 0; i < graph.n; i++) {
        finalComm[i] = currComm[hierarchy[i]]
      }
    }

    if (!improved) break

    const uniqueCount = new Set(Array.from(currComm)).size
    if (uniqueCount >= g.n) break   // no merging happened → already converged

    // Build super-graph for the next level
    const { sg, nodeMap } = buildSuperGraph(g, currComm)

    if (hierarchy === null) {
      hierarchy = nodeMap
    } else {
      const next = new Int32Array(graph.n)
      for (let i = 0; i < graph.n; i++) next[i] = nodeMap[hierarchy[i]]
      hierarchy = next
    }

    g = sg
    if (g.n <= 1) break
  }

  // Renumber communities as 0 … k-1 (dense, stable order)
  const remap = new Map<number, number>()
  for (const c of finalComm) {
    if (!remap.has(c)) remap.set(c, remap.size)
  }
  return Int32Array.from(finalComm, c => remap.get(c)!)
}

/**
 * Compute the modularity Q of a partition on the **original** graph.
 *
 *   Q = Σ_c [ e_c − a_c² ]
 *
 * where e_c = (Σ internal edge weights in c) / m
 *       a_c = (Σ node degrees in c) / (2m)
 */
export function computeModularity(g: Graph, community: Int32Array): number {
  if (g.m === 0) return 0

  const nc  = 1 + Math.max(...Array.from(community))
  const ec  = new Float64Array(nc)   // internal edge weight sum per community
  const ac  = new Float64Array(nc)   // degree sum per community

  for (let i = 0; i < g.n; i++) {
    ac[community[i]] += g.k[i]
    for (const { to, weight } of g.adj[i]) {
      if (to > i && community[i] === community[to]) {
        ec[community[i]] += weight
      }
    }
  }

  let Q = 0
  const m2 = 2 * g.m
  for (let c = 0; c < nc; c++) {
    Q += ec[c] / g.m - (ac[c] / m2) ** 2
  }
  return Q
}
