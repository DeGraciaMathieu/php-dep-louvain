<?php

declare(strict_types=1);

namespace PhpDepLouvain\Tests\Feature;

use PHPUnit\Framework\TestCase;

/**
 * Runs the real command line, as a user would, and reads what it prints.
 */
abstract class FeatureTestCase extends TestCase
{
    protected const SHOP      = __DIR__ . '/../Fixtures/shop';
    protected const MISPLACED = __DIR__ . '/../Fixtures/misplaced';
    protected const EMPTY     = __DIR__ . '/../Fixtures/empty';

    private const BIN = __DIR__ . '/../../bin/php-dep-louvain';

    /**
     * @param string[] $args
     * @return array{exitCode: int, stdout: string, stderr: string}
     */
    protected function runCommand(array $args, ?string $cwd = null): array
    {
        $process = proc_open(
            [PHP_BINARY, self::BIN, ...$args],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            $cwd,
        );

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return ['exitCode' => proc_close($process), 'stdout' => $stdout, 'stderr' => $stderr];
    }

    /**
     * @param string[] $args
     * @return array{meta: array<string, mixed>, communities: list<array<string, mixed>>}
     */
    protected function report(array $args): array
    {
        $result = $this->runCommand($args);
        $this->assertSame(0, $result['exitCode'], $result['stderr']);

        return json_decode($result['stdout'], true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * @param array{communities: list<array<string, mixed>>} $report
     * @return array<string, mixed>
     */
    protected function communityOf(string $class, array $report): array
    {
        foreach ($report['communities'] as $community) {
            if (in_array($class, [...$community['members'], ...$community['external_members']], true)) {
                return $community;
            }
        }

        $this->fail("{$class} belongs to no community");
    }
}
