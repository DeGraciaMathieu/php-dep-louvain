<?php

declare(strict_types=1);

namespace PhpDepLouvain\Console;

use PhpDep\Api\PhpDep;
use PhpDepLouvain\Graph\Graph;
use PhpDepLouvain\Graph\GraphBuilder;
use PhpDepLouvain\Louvain\Louvain;
use PhpDepLouvain\Output\HtmlRenderer;
use PhpDepLouvain\Output\TextRenderer;
use PhpDepLouvain\Report\ReportBuilder;

/**
 * CLI entry-point: analyze a PHP project with php-dep, then detect its class communities.
 */
final class Application
{
    private const USAGE = 'Usage: php-dep-louvain [--internal-only] [--format json|text|html] [--out file] [--max-levels n] [path]';

    /** @param string[] $argv */
    public function run(array $argv): int
    {
        $options = $this->parseArgs($argv);
        if (is_int($options)) {
            return $options;
        }

        try {
            $analysis = PhpDep::analyze($options['path']);
        } catch (\InvalidArgumentException $e) {
            fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
            return 1;
        }

        $g          = GraphBuilder::fromAnalysis($analysis, $options['internalOnly']);
        $partitions = Louvain::detectLevels($g, $options['maxLevels']);
        $community  = $partitions[array_key_last($partitions)];
        $modularity = Louvain::modularity($g, $community);

        $output = match ($options['format']) {
            'text' => TextRenderer::render($g, $community, $modularity),
            'html' => HtmlRenderer::render($this->levels($options['path'], $g, $partitions), $g),
            'json' => json_encode(
                $this->report($options['path'], $g, $community, $modularity),
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
            ),
        };

        if ($options['outputFile'] !== null) {
            file_put_contents($options['outputFile'], $output);
            fwrite(STDERR, "Written to {$options['outputFile']}\n");
        } else {
            fwrite(STDOUT, $output . "\n");
        }

        return 0;
    }

    /** @param int[] $community */
    private function report(string $path, Graph $g, array $community, float $modularity): array
    {
        return ReportBuilder::build((string) realpath($path), $g, $community, $modularity);
    }

    /**
     * Describe each Louvain level for the HTML page.
     *
     * @param list<int[]> $partitions
     * @return list<array{report: array{meta: array<string, mixed>, communities: list<array<string, mixed>>}, community: int[]}>
     */
    private function levels(string $path, Graph $g, array $partitions): array
    {
        return array_map(fn(array $community) => [
            'report'    => $this->report($path, $g, $community, Louvain::modularity($g, $community)),
            'community' => $community,
        ], $partitions);
    }

    /**
     * @param string[] $argv
     * @return array{path: string, outputFile: ?string, internalOnly: bool, format: string, maxLevels: int}|int
     *         the options, or the exit code when the command must stop
     */
    private function parseArgs(array $argv): array|int
    {
        $path         = '.';
        $outputFile   = null;
        $internalOnly = false;
        $format       = 'json';
        $maxLevels    = 15;

        for ($i = 1; $i < count($argv); $i++) {
            $arg = $argv[$i];
            if ($arg === '--help' || $arg === '-h') {
                fwrite(STDOUT, self::USAGE . "\n");
                return 0;
            } elseif ($arg === '--max-levels' && isset($argv[$i + 1])) {
                $n = filter_var($argv[++$i], FILTER_VALIDATE_INT);
                if ($n === false || $n < 1) {
                    fwrite(STDERR, "--max-levels must be a positive integer.\n");
                    return 1;
                }
                $maxLevels = $n;
            } elseif ($arg === '--internal-only') {
                $internalOnly = true;
            } elseif ($arg === '--format' && isset($argv[$i + 1])) {
                $format = $argv[++$i];
                if (!in_array($format, ['json', 'text', 'html'], true)) {
                    fwrite(STDERR, "Unknown format: {$format}. Use json, text, or html.\n");
                    return 1;
                }
            } elseif ($arg === '--out' && isset($argv[$i + 1])) {
                $outputFile = $argv[++$i];
            } elseif (!str_starts_with($arg, '-')) {
                $path = $arg;
            }
        }

        return compact('path', 'outputFile', 'internalOnly', 'format', 'maxLevels');
    }
}
