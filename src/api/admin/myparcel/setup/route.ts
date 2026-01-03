import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type MyParcelModuleService from "../../../../modules/myparcel/service"
import {
  DEFAULT_ALLOWED_CARRIERS,
  DEFAULT_FREE_SHIPPING_THRESHOLDS,
} from "../../../../modules/myparcel/constants"

// Medusa registers fulfillment providers under `${provider.identifier}_${optionName}`.
// With a `medusa-config.ts` provider option id of "myparcel" and service identifier "myparcel",
// the resulting provider id is "myparcel_myparcel".
const PROVIDER_REGISTRATION_ID = "myparcel_myparcel"
const LEGACY_PROVIDER_ID = "myparcel"
const SHIPPING_OPTION_TYPE_CODE = "myparcel"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const fulfillment = req.scope.resolve("fulfillment") as any

  const [serviceZones, shippingProfiles, shippingOptions] = await Promise.all([
    fulfillment.listServiceZones({}, { relations: ["geo_zones"], take: 200 }),
    fulfillment.listShippingProfiles({}, { take: 200 }),
    fulfillment.listShippingOptions({}, { relations: ["service_zone", "shipping_profile", "type"], take: 200 }),
  ])

  const myparcelOptions = (shippingOptions || []).filter(
    (option: any) =>
      option?.provider_id === PROVIDER_REGISTRATION_ID ||
      option?.provider_id === LEGACY_PROVIDER_ID
  )

  res.json({
    service_zones: serviceZones,
    shipping_profiles: shippingProfiles,
    shipping_options: myparcelOptions,
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const fulfillment = req.scope.resolve("fulfillment") as any
  const myparcel = req.scope.resolve("myparcel") as MyParcelModuleService
  const body = (req.body || {}) as any
  const {
    service_zone_id,
    shipping_profile_id,
    name,
    fallback_prices,
    fallback_prices_by_carrier,
    free_shipping_thresholds,
  } = body

  if (!service_zone_id || !shipping_profile_id || !name) {
    res.status(400).json({ message: "service_zone_id, shipping_profile_id, and name are required" })
    return
  }

  const existing = await fulfillment.listShippingOptions(
    {
      service_zone_id,
      shipping_profile_id,
    },
    { relations: ["service_zone", "shipping_profile", "type"], take: 200 }
  )
  const match = (existing || []).find(
    (option: any) =>
      option?.provider_id === PROVIDER_REGISTRATION_ID ||
      option?.provider_id === LEGACY_PROVIDER_ID
  )

  const optionType = await fulfillment.upsertShippingOptionTypes({
    code: SHIPPING_OPTION_TYPE_CODE,
    label: "MyParcel",
    description: "MyParcel delivery options",
  })

  const settings = await myparcel.getSettings()
  const allowedCarriers = Array.isArray((settings as any)?.allowed_carriers)
    ? ((settings as any).allowed_carriers as string[])
    : (DEFAULT_ALLOWED_CARRIERS as unknown as string[])
  const carrierSettings = allowedCarriers.reduce<Record<string, Record<string, unknown>>>(
    (acc, carrier) => {
      acc[carrier] = {}
      return acc
    },
    {}
  )

  const nextData = {
    fallback_prices: fallback_prices || (match?.data?.fallback_prices ?? {}),
    fallback_prices_by_carrier:
      typeof fallback_prices_by_carrier !== "undefined"
        ? fallback_prices_by_carrier
        : (match?.data?.fallback_prices_by_carrier ?? undefined),
    free_shipping_thresholds:
      free_shipping_thresholds ||
      (match?.data?.free_shipping_thresholds ?? DEFAULT_FREE_SHIPPING_THRESHOLDS),
    package_type: "package",
    platform: "belgie",
    default_carrier: settings?.default_carrier || "bpost",
    myparcel: {
      config: {
        platform: "belgie",
        showPriceSurcharge: true,
        showPrices: false,
        carrierSettings,
      },
      strings: {},
    },
  }

  if (match) {
    const updated = await fulfillment.updateShippingOptions(match.id, {
      name,
      price_type: "calculated",
      provider_id: PROVIDER_REGISTRATION_ID,
      type: optionType?.id || optionType,
      data: nextData,
    })

    res.json({ shipping_option: updated })
    return
  }

  const shippingOption = await fulfillment.createShippingOptions({
    name,
    price_type: "calculated",
    service_zone_id,
    shipping_profile_id,
    provider_id: PROVIDER_REGISTRATION_ID,
    type: optionType?.id || optionType,
    data: nextData,
  })

  res.json({ shipping_option: shippingOption })
}
