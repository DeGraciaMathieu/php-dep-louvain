<?php

declare(strict_types=1);

namespace PhpDepLouvain\Graph;

/**
 * Undirected weighted graph, indexed by integers for the Louvain passes.
 */
final class Graph
{
    /**
     * @param string[]                                  $labels       index → fqcn
     * @param bool[]                                    $isInternal   true if the node is a class declared in the project
     * @param array<int, list<array{int, float}>>       $adj          undirected adjacency list of [to, weight] (no self-loops)
     * @param float[]                                   $k            weighted degree of each node
     * @param float                                     $m            total edge weight (each undirected edge counted once)
     * @param list<array{int, int}>                     $dependencies each dependency once, as [user, used]
     */
    public function __construct(
        public readonly int $n,
        public readonly array $labels,
        public readonly array $isInternal,
        public readonly array $adj,
        public readonly array $k,
        public readonly float $m,
        public readonly array $dependencies = [],
    ) {}
}
