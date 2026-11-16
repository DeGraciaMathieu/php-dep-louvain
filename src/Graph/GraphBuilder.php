<?php

declare(strict_types=1);

namespace PhpDepLouvain\Graph;

use PhpDep\Api\Analysis;

final class GraphBuilder
{
    /**
     * Build an undirected, weighted graph from a php-dep analysis.
     *
     * Each dependency (A uses B) is an edge of weight 1, treated as undirected:
     * when A uses B and B uses A, the pair weighs 2.
     *
     * @param bool $internalOnly when true, only the classes declared in the project are
     *                           included; external/vendor nodes are ignored entirely.
     */
    public static function fromAnalysis(Analysis $analysis, bool $internalOnly = false): Graph
    {
        $classes = $analysis->classes();

        $index = array_flip($classes);
        if (!$internalOnly) {
            foreach ($classes as $class) {
                foreach ($analysis->dependenciesOf($class) as $dependency) {
                    $index[$dependency] ??= count($index);
                }
            }
        }

        $labels     = array_keys($index);
        $n          = count($labels);
        $isInternal = array_map(fn(string $label) => $analysis->isDeclared($label), $labels);

        // Merge both directions of a pair: same undirected pair → summed weight
        $edgeWeights = [];
        foreach ($classes as $class) {
            $s = $index[$class];
            foreach ($analysis->dependenciesOf($class) as $dependency) {
                $t = $index[$dependency] ?? null;
                if ($t === null || $s === $t) {
                    continue;
                }
                $key = min($s, $t) . ',' . max($s, $t);
                $edgeWeights[$key] = ($edgeWeights[$key] ?? 0.0) + 1.0;
            }
        }

        $adj = array_fill(0, $n, []);
        $k   = array_fill(0, $n, 0.0);
        $m   = 0.0;

        foreach ($edgeWeights as $key => $w) {
            [$a, $b] = array_map('intval', explode(',', (string) $key));
            $adj[$a][] = [$b, $w];
            $adj[$b][] = [$a, $w];
            $k[$a] += $w;
            $k[$b] += $w;
            $m     += $w;
        }

        return new Graph($n, $labels, $isInternal, $adj, $k, $m);
    }
}
