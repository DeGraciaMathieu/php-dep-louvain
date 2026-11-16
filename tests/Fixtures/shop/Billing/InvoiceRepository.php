<?php

namespace Shop\Billing;

final class InvoiceRepository
{
    public function find(int $id): Invoice
    {
        return new Invoice();
    }
}
