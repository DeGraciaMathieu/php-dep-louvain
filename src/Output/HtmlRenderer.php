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
     * Render every Louvain level, so the page can replay the iterations.
     *
     * @param list<array{report: array{meta: array<string, mixed>, communities: list<array<string, mixed>>}, community: int[]}> $levels
     */
    public static function render(array $levels, Graph $g): string
    {
        $lastMeta = $levels[array_key_last($levels)]['report']['meta'];

        $data = [
            'meta' => [
                'analyzed_path'       => $lastMeta['analyzed_path'],
                'node_count'          => $lastMeta['node_count'],
                'internal_node_count' => $lastMeta['internal_node_count'],
            ],
            'levels' => array_map(fn(array $level, int $i) => [
                'level'           => $i + 1,
                'modularity'      => $level['report']['meta']['modularity'],
                'community_count' => $level['report']['meta']['community_count'],
                'nodes'           => self::nodes($level['report']['communities']),
                'links'           => self::links($g, $level['community']),
                'communities'     => $level['report']['communities'],
            ], $levels, array_keys($levels)),
        ];

        return strtr((string) file_get_contents(self::TEMPLATE), [
            '{{TITLE}}' => htmlspecialchars($lastMeta['analyzed_path']),
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
            'cohesion'  => $c['cohesion'],
        ], $communities);
    }

    /**
     * Aggregate class-level dependencies into directed community-level links,
     * each keeping the class dependencies it is made of.
     *
     * @param int[] $community
     * @return list<array{source: string, target: string, weight: int, dependencies: list<array{string, string}>}>
     */
    private static function links(Graph $g, array $community): array
    {
        $links = [];
        foreach ($g->dependencies as [$from, $to]) {
            $a = $community[$from];
            $b = $community[$to];
            if ($a === $b) {
                continue;
            }
            $key = $a . '>' . $b;
            $links[$key] ??= ['source' => 'community-' . $a, 'target' => 'community-' . $b, 'weight' => 0, 'dependencies' => []];
            $links[$key]['weight']++;
            $links[$key]['dependencies'][] = [$g->labels[$from], $g->labels[$to]];
        }

        return array_values($links);
    }
}
