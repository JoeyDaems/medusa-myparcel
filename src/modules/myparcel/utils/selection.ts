import type { MyParcelDeliverySelection } from "../types"

export type OrderWithShippingMethods = {
  shipping_methods?: Array<{
    data?: Record<string, unknown> | null
  }> | null
}

function looksLikeSelection(data: Record<string, unknown>): boolean {
  const candidate = data as any
  return (
    typeof candidate.delivery_type !== "undefined" ||
    typeof candidate.is_pickup !== "undefined" ||
    typeof candidate.date !== "undefined" ||
    typeof candidate.pickup !== "undefined" ||
    typeof candidate.carrier !== "undefined"
  )
}

function pickValue<T>(...values: Array<T | null | undefined>) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value
    }
  }
  return undefined
}

function normalizePickup(candidate: any): MyParcelDeliverySelection["pickup"] | undefined {
  if (!candidate || typeof candidate !== "object") {
    return undefined
  }

  const address =
    candidate.address ||
    candidate.location_address ||
    candidate.locationAddress ||
    candidate.location?.address ||
    candidate.location?.location_address ||
    candidate.location?.locationAddress ||
    {}

  const pickup = {
    location_code: pickValue(
      candidate.location_code,
      candidate.locationCode,
      candidate.code,
      candidate.location?.location_code,
      candidate.location?.locationCode
    ),
    retail_network_id: pickValue(
      candidate.retail_network_id,
      candidate.retailNetworkId,
      candidate.networkId,
      candidate.retail_network,
      candidate.location?.retail_network_id,
      candidate.location?.retailNetworkId
    ),
    location_name: pickValue(
      candidate.location_name,
      candidate.locationName,
      candidate.name,
      candidate.location?.location_name,
      candidate.location?.locationName,
      candidate.location?.name
    ),
    address: {
      cc: pickValue(
        address.cc,
        address.country_code,
        address.countryCode,
        address.country
      ),
      city: pickValue(address.city),
      number: pickValue(address.number, address.house_number, address.houseNumber),
      number_suffix: pickValue(
        address.number_suffix,
        address.numberSuffix,
        address.number_addition,
        address.numberAddition,
        address.addition
      ),
      postal_code: pickValue(
        address.postal_code,
        address.postalCode,
        address.zip,
        address.zipCode
      ),
      street: pickValue(address.street, address.street_name, address.streetName),
    },
  } satisfies MyParcelDeliverySelection["pickup"]

  const addressValues = pickup.address
  if (
    !pickup.location_code &&
    !pickup.retail_network_id &&
    !pickup.location_name &&
    !addressValues.cc &&
    !addressValues.city &&
    !addressValues.postal_code &&
    !addressValues.street &&
    !addressValues.number
  ) {
    return undefined
  }

  return pickup
}

function normalizeSelection(candidate: any): MyParcelDeliverySelection {
  const deliveryType =
    candidate.delivery_type ??
    candidate.deliveryType ??
    candidate.delivery_type_id ??
    candidate.deliveryTypeId ??
    candidate.delivery_type_name ??
    candidate.deliveryTypeName

  const pickup =
    normalizePickup(candidate.pickup) ||
    normalizePickup(candidate.pickup_location) ||
    normalizePickup(candidate.pickupLocation) ||
    normalizePickup(candidate.pickup_point) ||
    normalizePickup(candidate.pickupPoint) ||
    normalizePickup(candidate.location)

  const carrierRaw =
    candidate.carrier ||
    candidate.carrier_id ||
    candidate.carrierId ||
    candidate.shipment_carrier ||
    candidate.shipmentCarrier
  const carrier = typeof carrierRaw === "string" ? carrierRaw.toLowerCase() : carrierRaw

  const isPickupCandidate =
    candidate.is_pickup ??
    candidate.isPickup ??
    candidate.is_pickup_point ??
    candidate.isPickupPoint
  const isPickup =
    typeof isPickupCandidate === "boolean"
      ? isPickupCandidate
      : pickup
      ? true
      : false

  const timeFrame =
    candidate.time_frame ||
    candidate.timeFrame ||
    (candidate.timeFrameStart || candidate.timeFrameEnd
      ? { start: candidate.timeFrameStart, end: candidate.timeFrameEnd }
      : undefined)

  return {
    ...candidate,
    carrier,
    is_pickup: isPickup,
    delivery_type: deliveryType,
    date:
      candidate.date ||
      candidate.delivery_date ||
      candidate.deliveryDate ||
      candidate.selected_date,
    time_frame: timeFrame,
    pickup: pickup ?? candidate.pickup,
    shipment_options:
      candidate.shipment_options ||
      candidate.shipmentOptions ||
      candidate.options ||
      candidate.shipment_options_data,
  }
}

export function resolveMyParcelSelection(
  order?: OrderWithShippingMethods | null
): MyParcelDeliverySelection | undefined {
  const methods = order?.shipping_methods || []
  for (const method of methods) {
    const data = method?.data as any
    if (!data || typeof data !== "object") {
      continue
    }

    const selection = data?.myparcel || data?.myparcel_delivery || data?.myparcel_selection
    if (selection && typeof selection === "object") {
      return normalizeSelection(selection)
    }

    if (looksLikeSelection(data)) {
      return normalizeSelection(data)
    }
  }

  return undefined
}
