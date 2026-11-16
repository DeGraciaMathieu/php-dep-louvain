<?php

declare(strict_types=1);

namespace PhpDepLouvain\Tests\Feature;

final class OutputFormatTest extends FeatureTestCase
{
    private string $outputFile;

    protected function setUp(): void
    {
        $this->outputFile = sys_get_temp_dir() . '/php-dep-louvain-' . uniqid() . '.html';
    }

    protected function tearDown(): void
    {
        @unlink($this->outputFile);
    }

    public function test_it_prints_a_json_report_by_default(): void
    {
        $result = $this->runCommand([self::SHOP]);

        $report = json_decode($result['stdout'], true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(2, $report['meta']['community_count']);
    }

    public function test_it_prints_a_readable_report_in_text_format(): void
    {
        $result = $this->runCommand(['--format', 'text', self::SHOP]);

        $this->assertSame(0, $result['exitCode']);
        $this->assertStringContainsString('Communities: 2', $result['stdout']);
        $this->assertStringContainsString('namespace: Shop\Billing', $result['stdout']);
        $this->assertStringContainsString('Psr\Log\LoggerInterface  [ext]', $result['stdout']);
    }

    public function test_it_writes_a_web_page_of_the_communities_in_html_format(): void
    {
        $result = $this->runCommand(['--format', 'html', '--out', $this->outputFile, self::SHOP]);

        $this->assertSame(0, $result['exitCode']);
        $this->assertSame('', $result['stdout']);
        $page = (string) file_get_contents($this->outputFile);
        $this->assertStringStartsWith('<!DOCTYPE html>', $page);
        $this->assertStringContainsString('Shop\\\\Billing\\\\BillingService', $page);
    }

    public function test_it_writes_the_report_to_a_file_instead_of_printing_it(): void
    {
        $result = $this->runCommand(['--format', 'text', '--out', $this->outputFile, self::SHOP]);

        $this->assertSame('', $result['stdout']);
        $this->assertStringContainsString("Written to {$this->outputFile}", $result['stderr']);
        $this->assertStringContainsString('Communities: 2', (string) file_get_contents($this->outputFile));
    }
}
