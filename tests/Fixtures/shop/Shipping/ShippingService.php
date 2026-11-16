<?php

namespace Shop\Shipping;

use Shop\Billing\Invoice;

final class ShippingService
{
    public function __construct(private Carrier $carrier) {}

    public function ship(Invoice $invoice): Parcel
    {
        $parcel = new Parcel(new TrackingNumber());
        $this->carrier->pickUp($parcel);

        return $parcel;
    }
}
