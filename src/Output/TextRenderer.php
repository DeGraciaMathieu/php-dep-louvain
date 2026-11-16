<?php

declare(strict_types=1);

namespace PhpDepLouvain\Output;

use PhpDepLouvain\Graph\Graph;
use PhpDepLouvain\Report\ReportBuilder;

final class TextRenderer
{
    /** @param int[] $community */
    public static function render(Graph $g, array $community, float $modularity): string
    {
        $membersByCommunity = ReportBuilder::membersByCommunity($community);

        $lines = [
            sprintf('Modularity : %.4f', $modularity),
            sprintf('Communities: %d', count($membersByCommunity)),
            '',
        ];

        foreach ($membersByCommunity as $id => $members) {
            $internal = array_filter($members, fn(int $i) => $g->isInternal[$i]);
            $ns       = ReportBuilder::dominantNamespace(array_map(fn(int $i) => $g->labels[$i], $internal));
            $lines[]  = sprintf('── Community %d  (%d nodes, namespace: %s)', $id, count($members), $ns);
            foreach ($members as $i) {
                $lines[] = '   ' . $g->labels[$i] . ($g->isInternal[$i] ? '' : '  [ext]');
            }
            $lines[] = '';
        }

        return implode("\n", $lines);
    }
}
