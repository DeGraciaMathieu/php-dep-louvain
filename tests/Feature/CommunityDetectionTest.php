<?php

declare(strict_types=1);

namespace PhpDepLouvain\Tests\Feature;

final class CommunityDetectionTest extends FeatureTestCase
{
    public function test_it_groups_the_classes_of_a_module_into_one_community(): void
    {
        $report = $this->report([self::SHOP]);

        $billing = $this->communityOf('Shop\Billing\BillingService', $report);

        $this->assertSame([
            'Shop\Billing\BillingService',
            'Shop\Billing\Invoice',
            'Shop\Billing\InvoiceRepository',
            'Shop\Billing\PaymentGateway',
        ], $billing['members']);
    }

    public function test_it_separates_modules_that_barely_depend_on_each_other(): void
    {
        $report = $this->report([self::SHOP]);

        $this->assertCount(2, $report['communities']);
        $this->assertNotSame(
            $this->communityOf('Shop\Billing\Invoice', $report)['id'],
            $this->communityOf('Shop\Shipping\ShippingService', $report)['id'],
        );
    }

    public function test_it_names_a_community_after_the_namespace_its_classes_share(): void
    {
        $report = $this->report([self::SHOP]);

        $this->assertSame('Shop\Billing', $this->communityOf('Shop\Billing\Invoice', $report)['namespace']);
        $this->assertSame('Shop\Shipping', $this->communityOf('Shop\Shipping\Parcel', $report)['namespace']);
    }

    public function test_it_names_a_community_after_its_namespace_despite_a_class_from_elsewhere(): void
    {
        $report = $this->report([self::MISPLACED]);

        $catalog = $this->communityOf('Shop\Billing\TaxRate', $report);

        $this->assertSame('Shop\Catalog', $catalog['namespace']);
    }

    public function test_it_measures_the_share_of_dependencies_that_stay_inside_a_community(): void
    {
        $report = $this->report([self::SHOP]);

        // Billing: 6 dependencies inside, ShippingService → Invoice comes from outside
        $this->assertEqualsWithDelta(6 / 7, $this->communityOf('Shop\Billing\Invoice', $report)['cohesion'], 0.0001);
    }

    public function test_it_puts_an_external_class_in_the_community_that_uses_it(): void
    {
        $report = $this->report([self::SHOP]);

        $billing = $this->communityOf('Shop\Billing\BillingService', $report);

        $this->assertSame(['Psr\Log\LoggerInterface'], $billing['external_members']);
        $this->assertNotContains('Psr\Log\LoggerInterface', $billing['members']);
    }

    public function test_it_leaves_external_classes_out_when_asked_for_internal_classes_only(): void
    {
        $report = $this->report(['--internal-only', self::SHOP]);

        foreach ($report['communities'] as $community) {
            $this->assertSame([], $community['external_members']);
        }
        $this->assertSame(8, $report['meta']['node_count']);
    }

    public function test_it_counts_the_classes_of_the_project_and_the_external_ones(): void
    {
        $report = $this->report([self::SHOP]);

        $this->assertSame(9, $report['meta']['node_count']);
        $this->assertSame(8, $report['meta']['internal_node_count']);
        $this->assertSame(realpath(self::SHOP), $report['meta']['analyzed_path']);
    }

    public function test_it_finds_no_community_in_a_project_without_classes(): void
    {
        $report = $this->report([self::EMPTY]);

        $this->assertSame([], $report['communities']);
        $this->assertSame(0, $report['meta']['community_count']);
    }
}
