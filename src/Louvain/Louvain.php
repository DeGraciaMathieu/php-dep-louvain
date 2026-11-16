<?php

declare(strict_types=1);

namespace PhpDepLouvain\Louvain;

use PhpDepLouvain\Graph\Graph;

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
final class Louvain
{
    /**
     * Run the multi-level Louvain algorithm on $graph.
     *
     * @return int[] community of each node, dense ids numbered by descending community size
     */
    public static function detect(Graph $graph, int $maxLevels = 15): array
    {
        if ($graph->n === 0) {
            return [];
        }

        $g = $graph;

        // hierarchy[i] = index of node i in the current-level graph
        $hierarchy = null;
        $finalComm = range(0, $graph->n - 1);

        for ($level = 0; $level < $maxLevels; $level++) {
            [$currComm, $improved] = self::runPhase1($g);

            // Map current-level communities back to original node indices
            if ($hierarchy === null) {
                $finalComm = $currComm;
            } else {
                for ($i = 0; $i < $graph->n; $i++) {
                    $finalComm[$i] = $currComm[$hierarchy[$i]];
                }
            }

            if (!$improved) {
                break;
            }

            if (count(array_unique($currComm)) >= $g->n) {
                break; // no merging happened → already converged
            }

            // Build super-graph for the next level
            [$sg, $nodeMap] = self::buildSuperGraph($g, $currComm);

            if ($hierarchy === null) {
                $hierarchy = $nodeMap;
            } else {
                for ($i = 0; $i < $graph->n; $i++) {
                    $hierarchy[$i] = $nodeMap[$hierarchy[$i]];
                }
            }

            $g = $sg;
            if ($g->n <= 1) {
                break;
            }
        }

        return self::numberBySize($finalComm);
    }

    /**
     * Compute the modularity Q of a partition on the **original** graph.
     *
     *   Q = Σ_c [ e_c − a_c² ]
     *
     * where e_c = (Σ internal edge weights in c) / m
     *       a_c = (Σ node degrees in c) / (2m)
     *
     * @param int[] $community
     */
    public static function modularity(Graph $g, array $community): float
    {
        if ($g->m == 0.0) {
            return 0.0;
        }

        $ec = []; // internal edge weight sum per community
        $ac = []; // degree sum per community

        for ($i = 0; $i < $g->n; $i++) {
            $c = $community[$i];
            $ac[$c] = ($ac[$c] ?? 0.0) + $g->k[$i];
            foreach ($g->adj[$i] as [$to, $weight]) {
                if ($to > $i && $c === $community[$to]) {
                    $ec[$c] = ($ec[$c] ?? 0.0) + $weight;
                }
            }
        }

        $q  = 0.0;
        $m2 = 2 * $g->m;
        foreach ($ac as $c => $degrees) {
            $q += ($ec[$c] ?? 0.0) / $g->m - ($degrees / $m2) ** 2;
        }

        return $q;
    }

    // -----------------------------------------------------------------------
    // Phase 1 – Modularity optimisation
    // -----------------------------------------------------------------------

    /** Modularity gain of adding isolated node i to community C. */
    private static function deltaQ(float $kIn, float $sigmaTot, float $ki, float $m): float
    {
        return $kIn / $m - ($sigmaTot * $ki) / (2 * $m * $m);
    }

    /**
     * Run Phase 1 on graph g, starting from one community per node.
     *
     * @return array{int[], bool} community of each node, and whether at least one node moved
     */
    private static function runPhase1(Graph $g): array
    {
        $community = range(0, $g->n - 1); // community[node] = community id
        $sigmaTot  = $g->k;               // Σ k_i for all i in each community

        $anyChange = false;
        $changed   = true;

        while ($changed) {
            $changed = false;

            for ($i = 0; $i < $g->n; $i++) {
                $ci = $community[$i];
                $ki = $g->k[$i];

                // Edges from i to its current community (before removal)
                $kInCi = 0.0;
                foreach ($g->adj[$i] as [$to, $weight]) {
                    if ($community[$to] === $ci) {
                        $kInCi += $weight;
                    }
                }

                // Remove i from ci
                $sigmaTot[$ci] -= $ki;
                $community[$i]  = -1;

                // Collect neighbour communities and edge weights from i to each
                $nbComm = [];
                foreach ($g->adj[$i] as [$to, $weight]) {
                    $c = $community[$to];
                    if ($c >= 0) {
                        $nbComm[$c] = ($nbComm[$c] ?? 0.0) + $weight;
                    }
                }
                // Always consider returning to the original community
                $nbComm[$ci] ??= $kInCi;

                // Find the community with the best modularity gain
                $bestC  = $ci;
                $bestDQ = self::deltaQ($nbComm[$ci], $sigmaTot[$ci], $ki, $g->m);

                foreach ($nbComm as $c => $kIn) {
                    if ($c === $ci) {
                        continue;
                    }
                    $dq = self::deltaQ($kIn, $sigmaTot[$c], $ki, $g->m);
                    if ($dq > $bestDQ) {
                        $bestDQ = $dq;
                        $bestC  = $c;
                    }
                }

                // Place i in the best community
                $sigmaTot[$bestC] += $ki;
                $community[$i]     = $bestC;

                if ($bestC !== $ci) {
                    $changed   = true;
                    $anyChange = true;
                }
            }
        }

        return [$community, $anyChange];
    }

    // -----------------------------------------------------------------------
    // Phase 2 – Graph aggregation
    // -----------------------------------------------------------------------

    /**
     * Collapse each community in $community into a super-node.
     *
     * Key invariants preserved across levels:
     *   • m stays equal to the original graph's total edge weight
     *   • k[super-node] = Σ k[original nodes in community]
     *     (captures both intra- and inter-community edges, keeping Σk = 2m)
     *   • Only inter-community edges appear in adj (intra edges → self-loops,
     *     already encoded in the super-node's elevated degree)
     *
     * @param int[] $community
     * @return array{Graph, int[]} the super-graph, and the super-node of each node
     */
    private static function buildSuperGraph(Graph $g, array $community): array
    {
        // Compact community ids to 0 … nc-1
        $remap   = [];
        $nodeMap = [];
        for ($i = 0; $i < $g->n; $i++) {
            $nodeMap[$i] = $remap[$community[$i]] ??= count($remap);
        }
        $nc = count($remap);

        // Super-node degrees = sum of original node degrees (preserves Σk = 2m)
        $sk = array_fill(0, $nc, 0.0);
        for ($i = 0; $i < $g->n; $i++) {
            $sk[$nodeMap[$i]] += $g->k[$i];
        }

        // Aggregate inter-community edges (sum weights for each undirected pair)
        $interEdges = [];
        for ($i = 0; $i < $g->n; $i++) {
            $ci = $nodeMap[$i];
            foreach ($g->adj[$i] as [$to, $weight]) {
                if ($to <= $i) {
                    continue; // skip the reverse half to avoid double-counting
                }
                $cj = $nodeMap[$to];
                if ($ci === $cj) {
                    continue; // intra-community → already in sk via self-loop
                }
                $key = min($ci, $cj) * $nc + max($ci, $cj);
                $interEdges[$key] = ($interEdges[$key] ?? 0.0) + $weight;
            }
        }

        $sadj = array_fill(0, $nc, []);
        foreach ($interEdges as $key => $w) {
            $a = intdiv($key, $nc);
            $b = $key % $nc;
            $sadj[$a][] = [$b, $w];
            $sadj[$b][] = [$a, $w];
        }

        $sg = new Graph(
            n:          $nc,
            labels:     array_map('strval', range(0, $nc - 1)),
            isInternal: array_fill(0, $nc, true),
            adj:        $sadj,
            k:          $sk,
            m:          $g->m, // total weight is invariant across levels
        );

        return [$sg, $nodeMap];
    }

    /**
     * Renumber communities 0 … k-1 by descending size, ties kept in order of first appearance.
     *
     * @param int[] $community
     * @return int[]
     */
    private static function numberBySize(array $community): array
    {
        $sizes = [];
        foreach ($community as $c) {
            $sizes[$c] = ($sizes[$c] ?? 0) + 1;
        }

        $order = array_keys($sizes);
        usort($order, fn(int $a, int $b) => $sizes[$b] <=> $sizes[$a]);
        $remap = array_flip($order);

        return array_map(fn(int $c) => $remap[$c], $community);
    }
}
