const DELIVERY_OPTIONS_BASE_URL = "https://api.myparcel.nl"
export const DELIVERY_OPTIONS_PLATFORM = "belgie"
export const DELIVERY_OPTIONS_PACKAGE_TYPE = "package"

const CACHE_TTL_MS = 5 * 60 * 1000
const deliveryOptionsCache = new Map<string, { expiresAt: number; data: any }>()

const DELIVERY_TYPE_ID_TO_NAME: Record<number, string> = {
  1: "morning",
  2: "standard",
  3: "evening",
  4: "pickup",
  7: "express",
}

const DELIVERY_TYPE_NAME_TO_ID: Record<string, number> = {
  morning: 1,
  standard: 2,
  evening: 3,
  pickup: 4,
  express: 7,
}

type AddressInput = {
  cc: string
  postal_code: string
  city?: string
  street?: string
  number?: string | number | null
}

type DeliveryOptionsParams = AddressInput & {
  carrier: string
  platform?: string
  package_type?: string
  include?: string
  deliverydays_window?: number
}

type PickupParams = DeliveryOptionsParams

export type DeliveryOptionPrice = {
  amount: number
  currency?: string
}

export type DeliveryOptionsResult = {
  deliveries: any[]
  pickup_locations: any[]
}

export type DeliverySelection = {
  carrier?: string
  is_pickup?: boolean
  delivery_type?: string | number
  date?: string
  time_frame?: {
    start?: string
    end?: string
  }
  pickup?: {
    location_code?: string | null
    retail_network_id?: string | null
    location_name?: string | null
    address?: {
      cc?: string | null
      city?: string | null
      number?: string | null
      number_suffix?: string | null
      postal_code?: string | null
      street?: string | null
    }
  }
}

function cacheGet(key: string) {
  const entry = deliveryOptionsCache.get(key)
  if (!entry) {
    return undefined
  }
  if (Date.now() > entry.expiresAt) {
    deliveryOptionsCache.delete(key)
    return undefined
  }
  return entry.data
}

function cacheSet(key: string, data: any) {
  deliveryOptionsCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  })
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return
    }
    query.set(key, String(value))
  })
  return query
}

async function publicJsonRequest(path: string, params: Record<string, any>) {
  const query = buildQuery(params)
  const url = `${DELIVERY_OPTIONS_BASE_URL}${path}?${query.toString()}`
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json;version=2.0",
      "User-Agent": "medusa-myparcel",
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`MyParcel delivery options request failed (${response.status}): ${text}`)
  }

  return response.json()
}

function normalizeResponse(raw: any): { deliveries: any[]; pickup_locations: any[] } {
  const data = raw?.data ?? raw ?? {}
  const deliveries = data.deliveries || data.delivery || []
  const pickup_locations = data.pickup_locations || data.pickup || []
  return { deliveries: Array.isArray(deliveries) ? deliveries : [], pickup_locations: Array.isArray(pickup_locations) ? pickup_locations : [] }
}

export function normalizeDeliveryType(input?: string | number | null) {
  if (typeof input === "number") {
    return DELIVERY_TYPE_ID_TO_NAME[input]
  }
  if (typeof input === "string") {
    return input.toLowerCase()
  }
  return undefined
}

export function normalizeDeliveryTypeId(input?: string | number | null) {
  if (typeof input === "number") {
    return input
  }
  if (typeof input === "string") {
    return DELIVERY_TYPE_NAME_TO_ID[input.toLowerCase()]
  }
  return undefined
}

export async function fetchDeliveryOptions(params: DeliveryOptionsParams): Promise<DeliveryOptionsResult> {
  const payload: DeliveryOptionsParams = {
    platform: DELIVERY_OPTIONS_PLATFORM,
    package_type: DELIVERY_OPTIONS_PACKAGE_TYPE,
    include: "shipment_options",
    ...params,
  }
  const cacheKey = `delivery_options:${JSON.stringify(payload)}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    return cached
  }

  const raw = await publicJsonRequest("/delivery_options", payload)
  const normalized = normalizeResponse(raw)
  cacheSet(cacheKey, normalized)
  return normalized
}

export async function fetchPickupLocations(params: PickupParams): Promise<DeliveryOptionsResult> {
  const payload: PickupParams = {
    platform: DELIVERY_OPTIONS_PLATFORM,
    package_type: DELIVERY_OPTIONS_PACKAGE_TYPE,
    ...params,
  }
  const cacheKey = `pickup_locations:${JSON.stringify(payload)}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    return cached
  }

  const raw = await publicJsonRequest("/pickup_locations", payload)
  const normalized = normalizeResponse(raw)
  cacheSet(cacheKey, normalized)
  return normalized
}

function extractPrice(candidate: any): DeliveryOptionPrice | undefined {
  if (!candidate) {
    return undefined
  }
  if (typeof candidate === "number") {
    return { amount: candidate }
  }
  if (typeof candidate.amount === "number") {
    return { amount: candidate.amount, currency: candidate.currency }
  }
  if (typeof candidate.price === "number") {
    return { amount: candidate.price }
  }
  if (candidate.price && typeof candidate.price.amount === "number") {
    return { amount: candidate.price.amount, currency: candidate.price.currency }
  }
  return undefined
}

function matchesTime(selection: DeliverySelection, start?: string, end?: string) {
  if (!selection.time_frame?.start && !selection.time_frame?.end) {
    return true
  }
  if (selection.time_frame?.start && start && selection.time_frame.start !== start) {
    return false
  }
  if (selection.time_frame?.end && end && selection.time_frame.end !== end) {
    return false
  }
  return true
}

export function resolveDeliveryPrice(selection: DeliverySelection, deliveries: any[]): DeliveryOptionPrice | undefined {
  if (!deliveries?.length || !selection.delivery_type) {
    return undefined
  }

  const selectionType = normalizeDeliveryType(selection.delivery_type)
  const selectionDate = selection.date

  for (const delivery of deliveries) {
    const date = delivery.date || delivery.day || delivery.delivery_date
    if (selectionDate && date && String(date).slice(0, 10) !== selectionDate) {
      continue
    }

    const timeFrames = delivery.time || delivery.delivery_time_frames || []
    if (Array.isArray(timeFrames) && timeFrames.length) {
      for (const time of timeFrames) {
        const type = normalizeDeliveryType(time.type || time.delivery_type || time.delivery_type_name || time.delivery_type_id)
        if (selectionType && type && selectionType !== type) {
          continue
        }
        const start = time.start || time.time_frame?.start || time.delivery_time_frame?.start
        const end = time.end || time.time_frame?.end || time.delivery_time_frame?.end
        if (!matchesTime(selection, start, end)) {
          continue
        }
        const price = extractPrice(time.price ?? time)
        if (price) {
          return price
        }
      }
    }

    const possibilities = delivery.possibilities || []
    if (Array.isArray(possibilities)) {
      for (const possibility of possibilities) {
        const type = normalizeDeliveryType(
          possibility.type || possibility.delivery_type || possibility.delivery_type_name || possibility.delivery_type_id
        )
        if (selectionType && type && selectionType !== type) {
          continue
        }
        const frames = possibility.delivery_time_frames || []
        if (Array.isArray(frames) && frames.length === 2) {
          const start = frames[0]?.date_time
          const end = frames[1]?.date_time
          if (!matchesTime(selection, start, end)) {
            continue
          }
        }
        const price = extractPrice(possibility.price ?? possibility)
        if (price) {
          return price
        }
      }
    }
  }

  return undefined
}

export function resolvePickupPrice(selection: DeliverySelection, pickupLocations: any[]): DeliveryOptionPrice | undefined {
  if (!selection.pickup?.location_code) {
    return undefined
  }
  const selectionType = normalizeDeliveryType(selection.delivery_type || "pickup")

  for (const location of pickupLocations || []) {
    const code = location.location?.location_code || location.location_code
    const network = location.location?.retail_network_id || location.retail_network_id
    if (code && selection.pickup.location_code && String(code) !== String(selection.pickup.location_code)) {
      continue
    }
    if (selection.pickup.retail_network_id && network && String(network) !== String(selection.pickup.retail_network_id)) {
      continue
    }

    const possibilities = location.possibilities || []
    for (const possibility of possibilities) {
      const type = normalizeDeliveryType(possibility.delivery_type_name || possibility.delivery_type_id || possibility.type)
      if (selectionType && type && selectionType !== type) {
        continue
      }
      const price = extractPrice(possibility.price ?? possibility)
      if (price) {
        return price
      }
    }

    const fallbackPrice = extractPrice(location.price ?? location)
    if (fallbackPrice) {
      return fallbackPrice
    }
  }

  return undefined
}
