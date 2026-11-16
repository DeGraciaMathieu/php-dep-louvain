<?php

declare(strict_types=1);

namespace PhpDepLouvain\Report;

use PhpDepLouvain\Graph\Graph;

/**
 * Describe each community of a partition: members, common namespace, density.
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
                'namespace'        => self::commonNamespace($internalMembers),
                'size'             => count($members),
                'internal_count'   => count($internalMembers),
                'density'          => round(self::density($members, $g), 4),
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

    /** @param string[] $fqcns */
    public static function commonNamespace(array $fqcns): string
    {
        if ($fqcns === []) {
            return '';
        }

        $parts    = array_map(fn(string $f) => explode('\\', $f), $fqcns);
        $shortest = min(array_map('count', $parts));
        $common   = [];
        for ($i = 0; $i < $shortest - 1; $i++) {
            $seg = $parts[0][$i];
            foreach ($parts as $p) {
                if ($p[$i] !== $seg) {
                    break 2;
                }
            }
            $common[] = $seg;
        }

        return $common === [] ? '(root)' : implode('\\', $common);
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
}
