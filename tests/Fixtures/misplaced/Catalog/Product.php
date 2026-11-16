<?php

namespace Shop\Catalog;

use Shop\Billing\TaxRate;

final class Product
{
    public function __construct(public TaxRate $taxRate) {}
}
