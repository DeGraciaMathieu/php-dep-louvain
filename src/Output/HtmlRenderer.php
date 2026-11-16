<?php

declare(strict_types=1);

namespace PhpDepLouvain\Output;

use PhpDepLouvain\Graph\Graph;

/**
 * Generate a self-contained HTML page with a D3 force-directed graph, one node per community.
 */
final class HtmlRenderer
{
    private const TEMPLATE = __DIR__ . '/../../resources/graph.html';

    /**
     * @param array{meta: array<string, mixed>, communities: list<array<string, mixed>>} $report
     * @param int[] $community
     */
    public static function render(array $report, Graph $g, array $community): string
    {
        $data = [
            'meta'        => $report['meta'],
            'nodes'       => self::nodes($report['communities']),
            'links'       => self::links($g, $community),
            'communities' => $report['communities'],
        ];

        return strtr((string) file_get_contents(self::TEMPLATE), [
            '{{TITLE}}' => htmlspecialchars($report['meta']['analyzed_path']),
            '{{DATA}}'  => json_encode($data, JSON_HEX_TAG | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }

    /**
     * @param list<array<string, mixed>> $communities
     * @return list<array<string, mixed>>
     */
    private static function nodes(array $communities): array
    {
        return array_map(fn(array $c) => [
            'id'        => 'community-' . $c['id'],
            'community' => $c['id'],
            'size'      => $c['internal_count'],
            'namespace' => $c['namespace'],
            'density'   => $c['density'],
            'short'     => 'C' . $c['id'],
        ], $communities);
    }

    /**
     * Aggregate class-level edges into community-level edges.
     *
     * @param int[] $community
     * @return list<array{source: string, target: string, weight: float}>
     */
    private static function links(Graph $g, array $community): array
    {
        $commWeights = [];
        for ($i = 0; $i < $g->n; $i++) {
            $ci = $community[$i];
            foreach ($g->adj[$i] as [$to, $weight]) {
                if ($to <= $i) {
                    continue;
                }
                $cj = $community[$to];
                if ($ci === $cj) {
                    continue;
                }
                $key = min($ci, $cj) . '|' . max($ci, $cj);
                $commWeights[$key] = ($commWeights[$key] ?? 0.0) + $weight;
            }
        }

        $links = [];
        foreach ($commWeights as $key => $weight) {
            [$a, $b] = explode('|', (string) $key);
            $links[] = ['source' => 'community-' . $a, 'target' => 'community-' . $b, 'weight' => $weight];
        }

        return $links;
    }
}
