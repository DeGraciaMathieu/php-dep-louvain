<?php

namespace Shop\Catalog;

use Shop\Billing\TaxRate;

final class PriceCalculator
{
    public function price(Product $product, TaxRate $taxRate): float
    {
        return 0.0;
    }
}
