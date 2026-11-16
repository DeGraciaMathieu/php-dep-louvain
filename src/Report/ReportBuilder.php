<?php

declare(strict_types=1);

namespace PhpDepLouvain\Report;

use PhpDepLouvain\Graph\Graph;

/**
 * Describe each community of a partition: members, dominant namespace, density, cohesion.
 */
final class ReportBuilder
{
    /**
     * @param int[] $community community of each node, numbered by descending size
     * @return array{meta: array<string, mixed>, communities: list<array<string, mixed>>}
     */
    public static function build(string $analyzedPath, Graph $g, array $community, float $modularity): array
    {
        $communities = [];
        foreach (self::membersByCommunity($community) as $id => $members) {
            $internalMembers = [];
            $externalMembers = [];
            foreach ($members as $i) {
                if ($g->isInternal[$i]) {
                    $internalMembers[] = $g->labels[$i];
                } else {
                    $externalMembers[] = $g->labels[$i];
                }
            }
            sort($internalMembers);
            sort($externalMembers);

            $communities[] = [
                'id'               => $id,
                'namespace'        => self::dominantNamespace($internalMembers),
                'size'             => count($members),
                'internal_count'   => count($internalMembers),
                'density'          => round(self::density($members, $g), 4),
                'cohesion'         => round(self::cohesion($id, $g, $community), 4),
                'members'          => $internalMembers,
                'external_members' => $externalMembers,
            ];
        }

        return [
            'meta' => [
                'analyzed_path'       => $analyzedPath,
                'modularity'          => round($modularity, 6),
                'community_count'     => count($communities),
                'node_count'          => $g->n,
                'internal_node_count' => count(array_filter($g->isInternal)),
            ],
            'communities' => $communities,
        ];
    }

    /**
     * @param int[] $community
     * @return array<int, int[]> community id → node indices, ordered by id
     */
    public static function membersByCommunity(array $community): array
    {
        $members = [];
        foreach ($community as $i => $c) {
            $members[$c][] = $i;
        }
        ksort($members);

        return $members;
    }

    /**
     * The longest namespace shared by more than half of the classes: one class
     * from elsewhere does not hide the namespace the others live in.
     *
     * @param string[] $fqcns
     */
    public static function dominantNamespace(array $fqcns): string
    {
        if ($fqcns === []) {
            return '';
        }

        $namespaces = array_map(fn(string $f) => array_slice(explode('\\', $f), 0, -1), $fqcns);
        $dominant   = [];

        for ($depth = 1; ; $depth++) {
            $counts = [];
            foreach ($namespaces as $segments) {
                if (count($segments) >= $depth && array_slice($segments, 0, $depth - 1) === $dominant) {
                    $prefix = implode('\\', array_slice($segments, 0, $depth));
                    $counts[$prefix] = ($counts[$prefix] ?? 0) + 1;
                }
            }
            if ($counts === []) {
                break;
            }

            arsort($counts);
            $prefix = (string) array_key_first($counts);
            if ($counts[$prefix] * 2 <= count($fqcns)) {
                break;
            }
            $dominant = explode('\\', $prefix);
        }

        return $dominant === [] ? '(root)' : implode('\\', $dominant);
    }

    /** @param int[] $members */
    private static function density(array $members, Graph $g): float
    {
        $n = count($members);
        if ($n < 2) {
            return 0.0;
        }

        $set   = array_flip($members);
        $edges = 0;
        foreach ($members as $m) {
            foreach ($g->adj[$m] as [$to]) {
                if ($to > $m && isset($set[$to])) {
                    $edges++;
                }
            }
        }

        return $edges / (($n * ($n - 1)) / 2);
    }

    /**
     * Share of the dependencies from or to the community that stay inside it.
     *
     * @param int[] $community
     */
    private static function cohesion(int $id, Graph $g, array $community): float
    {
        $inside = 0;
        $total  = 0;
        foreach ($g->dependencies as [$from, $to]) {
            if ($community[$from] !== $id && $community[$to] !== $id) {
                continue;
            }
            $total++;
            if ($community[$from] === $community[$to]) {
                $inside++;
            }
        }

        return $total === 0 ? 0.0 : $inside / $total;
    }
}
