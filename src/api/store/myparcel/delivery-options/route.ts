import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DEFAULT_ALLOWED_CARRIERS } from "../../../../modules/myparcel/constants"
import { parseStreet } from "../../../../modules/myparcel/utils/address"
import {
  DELIVERY_OPTIONS_PACKAGE_TYPE,
  fetchDeliveryOptions,
  fetchPickupLocations,
} from "../../../../modules/myparcel/utils/delivery-options"
import { getCartService, getMyParcelService } from "../helpers"

function toStringArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cartId = String(req.query.cart_id || "")
  if (!cartId) {
    res.status(400).json({ message: "cart_id is required" })
    return
  }

  const cartService = getCartService(req)
  const cart = await cartService.retrieveCart(cartId, {
    relations: ["shipping_address"],
  })

  const address = cart?.shipping_address
  if (!address?.postal_code || !address?.country_code) {
    res.status(400).json({ message: "Cart shipping address is incomplete" })
    return
  }

  const service = getMyParcelService(req)
  const settings = await service.getSettings()
  const allowed =
    (settings?.allowed_carriers as unknown as string[]) || DEFAULT_ALLOWED_CARRIERS

  const carrierFilter = toStringArray(req.query.carrier as any)
  const carriers = (allowed || DEFAULT_ALLOWED_CARRIERS).filter((carrier) =>
    carrierFilter.length ? carrierFilter.includes(carrier) : true
  )

  const { street, number } = parseStreet(address.address_1, address.address_2)
  const baseParams = {
    cc: String(address.country_code).toUpperCase(),
    postal_code: address.postal_code,
    city: address.city || undefined,
    street: street || undefined,
    number: number || undefined,
  }

  const deliveries: Record<string, any[]> = {}
  const pickup_locations: Record<string, any[]> = {}

  await Promise.all(
    carriers.map(async (carrier) => {
      const params = {
        carrier,
        ...baseParams,
      }
      const [deliveryResponse, pickupResponse] = await Promise.all([
        fetchDeliveryOptions(params),
        fetchPickupLocations(params),
      ])
      deliveries[carrier] = deliveryResponse.deliveries
      pickup_locations[carrier] = pickupResponse.pickup_locations
    })
  )

  res.json({
    platform: "belgie",
    package_type: DELIVERY_OPTIONS_PACKAGE_TYPE,
    carriers,
    deliveries,
    pickup_locations,
  })
}
