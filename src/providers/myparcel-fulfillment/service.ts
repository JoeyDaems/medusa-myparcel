import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { parseStreet } from "../../modules/myparcel/utils/address"
import {
  fetchDeliveryOptions,
  fetchPickupLocations,
  normalizeDeliveryType,
  resolveDeliveryPrice,
  resolvePickupPrice,
  type DeliverySelection,
} from "../../modules/myparcel/utils/delivery-options"

type Dependencies = {
  logger: Logger
}

function toCents(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value)
  return Number.isFinite(amount) ? Math.round(amount) : 0
}

function centsToMajor(cents: number): number {
  return toCents(cents) / 100
}

function resolveSelection(data: Record<string, unknown> | null | undefined): DeliverySelection | undefined {
  if (!data) {
    return undefined
  }

  const candidate =
    (data as any).myparcel ||
    (data as any).myparcel_delivery ||
    (data as any).myparcel_selection

  if (candidate && typeof candidate === "object") {
    return candidate as DeliverySelection
  }

  // Some clients may store the selection as the root object.
  const maybeSelection = data as any
  const looksLikeSelection =
    typeof maybeSelection?.delivery_type !== "undefined" ||
    typeof maybeSelection?.is_pickup !== "undefined" ||
    typeof maybeSelection?.date !== "undefined" ||
    typeof maybeSelection?.pickup !== "undefined" ||
    typeof maybeSelection?.carrier !== "undefined"

  return looksLikeSelection ? (data as DeliverySelection) : undefined
}

function resolveBasePrice(
  basePrices: Record<string, number> | undefined,
  deliveryType?: string | number
): number {
  const normalized = normalizeDeliveryType(deliveryType) || "standard"

  if (basePrices && typeof basePrices[normalized] === "number") {
    return basePrices[normalized]
  }

  if (basePrices && typeof basePrices.standard === "number") {
    return basePrices.standard
  }

  return 0
}

function resolveCarrierBasePrices(
  carrierPrices: Record<string, Record<string, number>> | undefined,
  carrier?: string
): Record<string, number> | undefined {
  if (!carrierPrices || typeof carrierPrices !== "object") {
    return undefined
  }
  if (!carrier) {
    return undefined
  }
  const entry = (carrierPrices as Record<string, unknown>)[carrier]
  if (entry && typeof entry === "object") {
    return entry as Record<string, number>
  }
  return undefined
}

function resolveTaxInclusive(optionData: Record<string, unknown>): boolean {
  const candidate =
    (optionData?.prices_include_tax as boolean | undefined) ??
    (optionData?.pricesIncludeTax as boolean | undefined)
  return typeof candidate === "boolean" ? candidate : true
}

export class MyParcelFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "myparcel"
  protected logger_: Logger

  constructor({ logger }: Dependencies) {
    super()
    this.logger_ = logger
  }

  async getFulfillmentOptions() {
    return [{ id: MyParcelFulfillmentService.identifier }]
  }

  async validateFulfillmentData(optionData: Record<string, unknown>, data: Record<string, unknown>, context: any) {
    const selection = resolveSelection(data)
    if (!selection) {
      return data
    }

    const address = context?.shipping_address
    if (!address?.country_code) {
      throw new Error("Shipping address is required to select MyParcel delivery options")
    }

    const cc = String(address.country_code).toUpperCase()
    if (cc === "NL" || cc === "BE") {
      const { street, number } = parseStreet(address.address_1, address.address_2)
      if (!street || !number) {
        throw new Error("House number is required for NL/BE shipping addresses")
      }
    }

    return data
  }

  async calculatePrice(optionData: Record<string, unknown>, data: Record<string, unknown>, context: any) {
    const selection = resolveSelection(data)
    const basePrices = (optionData?.fallback_prices || optionData?.fallbackPrices) as
      | Record<string, number>
      | undefined
    const carrierPrices = (optionData?.fallback_prices_by_carrier ||
      optionData?.fallbackPricesByCarrier) as
      | Record<string, Record<string, number>>
      | undefined

    const carrierCandidate = selection?.carrier || (optionData?.default_carrier as string) || "bpost"
    const carrier = String(carrierCandidate).toLowerCase()
    const isTaxInclusive = resolveTaxInclusive(optionData)

    const selectionType =
      selection?.delivery_type || (selection?.is_pickup ? "pickup" : "standard")
    const carrierBasePrices = resolveCarrierBasePrices(carrierPrices, carrier)
    const baseCents = toCents(
      resolveBasePrice(carrierBasePrices ?? basePrices, selectionType)
    )

    const address = context?.shipping_address
    if (!address?.postal_code || !address?.country_code) {
      return {
        calculated_amount: centsToMajor(baseCents),
        is_calculated_price_tax_inclusive: isTaxInclusive,
      }
    }

    if (!selection) {
      return {
        calculated_amount: centsToMajor(baseCents),
        is_calculated_price_tax_inclusive: isTaxInclusive,
      }
    }

    const { street, number } = parseStreet(address.address_1, address.address_2)
    const params = {
      carrier,
      cc: String(address.country_code).toUpperCase(),
      postal_code: address.postal_code,
      city: address.city || undefined,
      street: street || undefined,
      number: number || undefined,
    }

    try {
      const [deliveryResponse, pickupResponse] = await Promise.all([
        fetchDeliveryOptions(params),
        fetchPickupLocations(params),
      ])

      const surcharge = selection.is_pickup
        ? resolvePickupPrice(selection, pickupResponse.pickup_locations)
        : resolveDeliveryPrice(selection, deliveryResponse.deliveries)

      if (surcharge && typeof surcharge.amount === "number") {
        const surchargeCents = toCents(surcharge.amount)
        return {
          calculated_amount: centsToMajor(baseCents + surchargeCents),
          is_calculated_price_tax_inclusive: isTaxInclusive,
        }
      }
    } catch (error) {
      this.logger_.warn(`MyParcel price calculation failed: ${String(error)}`)
    }

    return {
      calculated_amount: centsToMajor(baseCents),
      is_calculated_price_tax_inclusive: isTaxInclusive,
    }
  }

  async canCalculate() {
    return true
  }

  async validateOption() {
    return true
  }

  async createFulfillment() {
    return { data: {}, labels: [] }
  }

  async cancelFulfillment() {
    return {}
  }

  async createReturnFulfillment() {
    return { data: {}, labels: [] }
  }
}
