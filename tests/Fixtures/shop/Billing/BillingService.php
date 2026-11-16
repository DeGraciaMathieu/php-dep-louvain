<?php

namespace Shop\Billing;

use Psr\Log\LoggerInterface;

final class BillingService
{
    public function __construct(
        private InvoiceRepository $invoices,
        private PaymentGateway $gateway,
        private LoggerInterface $logger,
    ) {}

    public function pay(int $id): Invoice
    {
        $invoice = $this->invoices->find($id);
        $this->gateway->charge($invoice);

        return $invoice;
    }
}
