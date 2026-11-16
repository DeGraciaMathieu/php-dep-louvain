<?php

declare(strict_types=1);

namespace PhpDepLouvain\Tests\Feature;

final class CommandLineTest extends FeatureTestCase
{
    public function test_it_analyzes_the_current_directory_when_no_path_is_given(): void
    {
        $result = $this->runCommand([], cwd: self::SHOP);

        $report = json_decode($result['stdout'], true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(realpath(self::SHOP), $report['meta']['analyzed_path']);
    }

    public function test_it_shows_its_usage(): void
    {
        $result = $this->runCommand(['--help']);

        $this->assertSame(0, $result['exitCode']);
        $this->assertStringStartsWith('Usage: php-dep-louvain', $result['stdout']);
    }

    public function test_it_fails_on_a_path_that_does_not_exist(): void
    {
        $result = $this->runCommand(['/does/not/exist']);

        $this->assertSame(1, $result['exitCode']);
        $this->assertStringContainsString('Path not found: /does/not/exist', $result['stderr']);
    }

    public function test_it_fails_on_an_unknown_format(): void
    {
        $result = $this->runCommand(['--format', 'xml', self::SHOP]);

        $this->assertSame(1, $result['exitCode']);
        $this->assertStringContainsString('Unknown format: xml', $result['stderr']);
    }

    public function test_it_fails_on_a_max_levels_that_is_not_a_positive_integer(): void
    {
        $result = $this->runCommand(['--max-levels', '0', self::SHOP]);

        $this->assertSame(1, $result['exitCode']);
        $this->assertStringContainsString('--max-levels must be a positive integer', $result['stderr']);
    }
}
