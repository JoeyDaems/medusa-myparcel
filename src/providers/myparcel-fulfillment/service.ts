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
import { DEFAULT_FREE_SHIPPING_THRESHOLDS } from "../../modules/myparcel/constants"

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

function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed.toUpperCase() : undefined
}

function resolveMinorAmount(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.round(parsed) : undefined
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if ("value" in record) {
      return resolveMinorAmount(record.value)
    }
    if ("raw" in record) {
      return resolveMinorAmount(record.raw)
    }
  }

  return undefined
}

function resolveMajorAmount(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof (record as { toJSON?: unknown }).toJSON === "function") {
      const serialized = (record as { toJSON: () => unknown }).toJSON()
      const resolved = resolveMajorAmount(serialized)
      if (typeof resolved === "number") {
        return resolved
      }
    }
    if ("numeric" in record) {
      return resolveMajorAmount(record.numeric)
    }
    if ("value" in record) {
      return resolveMajorAmount(record.value)
    }
    if ("raw" in record) {
      return resolveMajorAmount(record.raw)
    }
  }

  return undefined
}

function resolveItemsTotal(items: unknown): number | undefined {
  if (!Array.isArray(items)) {
    return undefined
  }

  let total = 0
  let found = false
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue
    }
    const record = item as Record<string, unknown>
    let amount = resolveMajorAmount(record.item_total)
    if (amount === undefined) {
      amount = resolveMajorAmount(record.total)
    }
    if (amount === undefined) {
      amount = resolveMajorAmount(record.subtotal)
    }
    if (amount === undefined) {
      const unitPrice = resolveMajorAmount(record.unit_price)
      const quantity = resolveMajorAmount(record.quantity)
      if (unitPrice !== undefined && quantity !== undefined) {
        amount = unitPrice * quantity
      }
    }

    if (typeof amount === "number") {
      total += amount
      found = true
    }
  }

  return found ? total : undefined
}

function resolveFreeShippingThresholds(optionData: Record<string, unknown>) {
  const candidate =
    (optionData?.free_shipping_thresholds as Record<string, unknown> | undefined) ??
    (optionData?.freeShippingThresholds as Record<string, unknown> | undefined)
  const thresholds: Record<string, number> = {
    ...DEFAULT_FREE_SHIPPING_THRESHOLDS,
  }

  if (candidate && typeof candidate === "object") {
    Object.entries(candidate).forEach(([key, value]) => {
      const amount = resolveMinorAmount(value)
      if (typeof amount === "number") {
        thresholds[String(key).toUpperCase()] = amount
      }
    })
  }

  return thresholds
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

    const countryCode = normalizeCountryCode(context?.shipping_address?.country_code)
    const itemTotal =
      resolveMajorAmount(context?.item_total) ??
      resolveMajorAmount(context?.raw_item_total) ??
      resolveItemsTotal(context?.items)
    const threshold = countryCode
      ? resolveFreeShippingThresholds(optionData)[countryCode]
      : undefined
    const thresholdMajor = typeof threshold === "number" ? centsToMajor(threshold) : undefined
    if (typeof thresholdMajor === "number" && itemTotal !== undefined && itemTotal >= thresholdMajor) {
      return {
        calculated_amount: 0,
        is_calculated_price_tax_inclusive: isTaxInclusive,
      }
    }

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
