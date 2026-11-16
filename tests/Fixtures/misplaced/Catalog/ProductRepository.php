<?php

namespace Shop\Catalog;

final class ProductRepository
{
    public function find(int $id): Product
    {
        return new Product(new \Shop\Billing\TaxRate());
    }
}
