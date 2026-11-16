<?php

namespace Shop\Shipping;

final class Parcel
{
    public function __construct(public TrackingNumber $tracking) {}
}
