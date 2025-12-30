import { MedusaService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { MyParcelConsignment } from "./models/consignment"
import { MyParcelSetting } from "./models/settings"
import {
  CARRIER_IDS,
  DEFAULT_A4_POSITION,
  DEFAULT_ALLOWED_CARRIERS,
  DEFAULT_LABEL_FORMAT,
  type CarrierKey,
} from "./constants"
import type {
  CreateConsignmentInput,
  MyParcelDeliverySelection,
  MyParcelSettingsInput,
} from "./types"
import {
  myparcelJsonRequest,
  myparcelPdfRequest,
  encodeApiKey,
} from "./utils/myparcel-client"
import { decryptSecret, encryptSecret, getEncryptionKey } from "./utils/crypto"
import { parseStreet } from "./utils/address"
import {
  fetchPickupLocations,
  normalizeDeliveryTypeId,
} from "./utils/delivery-options"
import { resolveMyParcelSelection } from "./utils/selection"

type Dependencies = {
  logger: Logger
}

type ModuleOptions = {
  default_label_format?: "A4" | "A6"
}

type OrderLike = {
  id: string
  display_id?: number | string | null
  email?: string | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    company?: string | null
    phone?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    postal_code?: string | null
    province?: string | null
    country_code?: string | null
  } | null
  items?: Array<{
    quantity?: number | null
    variant?: {
      weight?: number | null
    } | null
  }>
  shipping_methods?: Array<{
    data?: Record<string, unknown> | null
  }>
}

function formatRecipientName(address?: OrderLike["shipping_address"], fallback?: string | null) {
  const first = address?.first_name?.trim() ?? ""
  const last = address?.last_name?.trim() ?? ""
  const combined = `${first} ${last}`.trim()
  return combined || fallback || ""
}

function calculateWeight(items?: OrderLike["items"]) {
  if (!items?.length) {
    return 1000
  }

  const total = items.reduce((sum, item) => {
    const quantity = item.quantity ?? 0
    const weight = item.variant?.weight ?? 0
    return sum + quantity * weight
  }, 0)

  return total > 0 ? total : 1000
}

const SHIPMENT_OPTION_KEYS = new Set([
  "age_check",
  "collect",
  "cooled_delivery",
  "insurance",
  "large_format",
  "only_recipient",
  "return",
  "same_day_delivery",
  "saturday_delivery",
  "signature",
])

function normalizeMyParcelId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>
  const direct =
    record.id ??
    record.shipment_id ??
    record.shipmentId ??
    record.myparcel_id ??
    record.myparcelId
  if (direct !== undefined) {
    return normalizeMyParcelId(direct)
  }

  const data = record.data
  if (data && typeof data === "object") {
    const nested =
      (data as any).id ||
      (data as any).shipment_id ||
      (data as any).shipmentId ||
      (data as any).myparcel_id ||
      (data as any).myparcelId
    if (nested !== undefined) {
      return normalizeMyParcelId(nested)
    }
  }

  const ids = record.ids
  if (Array.isArray(ids) && ids.length) {
    return normalizeMyParcelId(ids[0])
  }

  const shipments = record.shipments
  if (Array.isArray(shipments) && shipments.length) {
    return normalizeMyParcelId((shipments[0] as any)?.id)
  }

  return null
}

function normalizeStatus(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === "number") {
    return String(value)
  }
  if (typeof value === "object") {
    const candidate = (value as any).status ?? (value as any).code ?? (value as any).id
    if (candidate !== undefined) {
      return normalizeStatus(candidate)
    }
  }
  return null
}

function toSnakeCase(value: string) {
  return value.replace(/([A-Z])/g, "_$1").toLowerCase()
}

function mapShipmentOptions(input?: Record<string, boolean | number>) {
  if (!input) {
    return {}
  }
  const mapped: Record<string, number> = {}
  Object.entries(input).forEach(([key, value]) => {
    if (typeof value !== "boolean" && typeof value !== "number") {
      return
    }
    const normalized = key.includes("_") ? key : toSnakeCase(key)
    if (SHIPMENT_OPTION_KEYS.has(normalized)) {
      if (typeof value === "number") {
        mapped[normalized] = value
      } else {
        mapped[normalized] = value ? 1 : 0
      }
    }
  })
  return mapped
}

function normalizeDeliveryDate(value?: string | null) {
  if (!value) {
    return undefined
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value} 00:00:00`
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const cleaned = value.replace("T", " ").replace(/Z$/, "")
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cleaned)) {
      return `${cleaned}:00`
    }
    return cleaned.replace(/\.\d+$/, "")
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value
  }
  return value
}

const REQUIRED_PICKUP_FIELDS = [
  "location_code",
  "location_name",
  "cc",
  "city",
  "street",
  "postal_code",
] as const

function missingPickupFields(pickup?: Record<string, unknown>) {
  if (!pickup) {
    return REQUIRED_PICKUP_FIELDS
  }
  return REQUIRED_PICKUP_FIELDS.filter((field) => {
    const value = pickup[field]
    return value === undefined || value === null || value === ""
  })
}

function resolveLocationField(location: any, key: string) {
  return (
    location?.[key] ??
    location?.[key.toLowerCase()] ??
    location?.location?.[key] ??
    location?.location?.[key.toLowerCase()]
  )
}

function resolveLocationAddress(location: any) {
  return (
    location?.address ||
    location?.location?.address ||
    location?.location_address ||
    location?.location?.location_address ||
    {}
  )
}

function findPickupMatch(
  locations: any[],
  selection: MyParcelDeliverySelection
) {
  if (!Array.isArray(locations)) {
    return undefined
  }
  return locations.find((location) => {
    const code =
      location?.location?.location_code || location?.location_code
    const network =
      location?.location?.retail_network_id || location?.retail_network_id
    if (selection.pickup?.location_code && code && String(code) !== String(selection.pickup.location_code)) {
      return false
    }
    if (selection.pickup?.retail_network_id && network && String(network) !== String(selection.pickup.retail_network_id)) {
      return false
    }
    return true
  })
}

async function buildPickupPayload(
  selection: MyParcelDeliverySelection,
  params: {
    carrier: string
    cc: string
    postal_code: string
    city?: string
    street?: string
    number?: string | number | null
  }
) {
  if (!selection.pickup) {
    return undefined
  }

  const pickupAddress = selection.pickup.address || {}
  const payload: Record<string, unknown> = {
    location_code: selection.pickup.location_code || undefined,
    retail_network_id: selection.pickup.retail_network_id || undefined,
    location_name: selection.pickup.location_name || undefined,
    cc: pickupAddress.cc || undefined,
    city: pickupAddress.city || undefined,
    number: pickupAddress.number ? String(pickupAddress.number) : undefined,
    number_suffix: pickupAddress.number_suffix || undefined,
    postal_code: pickupAddress.postal_code || undefined,
    street: pickupAddress.street || undefined,
  }

  if (missingPickupFields(payload).length === 0) {
    return payload
  }

  if (selection.pickup.location_code) {
    const response = await fetchPickupLocations({
      carrier: params.carrier,
      cc: params.cc,
      postal_code: params.postal_code,
      city: params.city,
      street: params.street,
      number: params.number,
    })

    const match = findPickupMatch(response.pickup_locations, selection)
    if (match) {
      const location = match.location || match
      const address = resolveLocationAddress(match)

      payload.location_code =
        payload.location_code ||
        resolveLocationField(location, "location_code") ||
        resolveLocationField(match, "location_code")
      payload.retail_network_id =
        payload.retail_network_id ||
        resolveLocationField(location, "retail_network_id") ||
        resolveLocationField(match, "retail_network_id")
      payload.location_name =
        payload.location_name ||
        resolveLocationField(location, "location_name") ||
        resolveLocationField(match, "location_name") ||
        resolveLocationField(location, "name")
      payload.cc =
        payload.cc ||
        address?.cc ||
        address?.country_code ||
        resolveLocationField(location, "cc")
      payload.city =
        payload.city ||
        address?.city ||
        resolveLocationField(location, "city")
      payload.postal_code =
        payload.postal_code ||
        address?.postal_code ||
        resolveLocationField(location, "postal_code")
      payload.street =
        payload.street ||
        address?.street ||
        resolveLocationField(location, "street")
      payload.number =
        payload.number ||
        (address?.number ? String(address.number) : undefined) ||
        (resolveLocationField(location, "number") ? String(resolveLocationField(location, "number")) : undefined)
      payload.number_suffix =
        payload.number_suffix ||
        address?.number_suffix ||
        resolveLocationField(location, "number_suffix") ||
        resolveLocationField(location, "number_addition")
    }
  }

  return payload
}

const normalizeLabelFormat = (value?: string | null) => {
  if (value === "A4" || value === "A6") {
    return value
  }
  return undefined
}

function toBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    return value === 1
  }
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") {
      return true
    }
    if (value === "0" || value.toLowerCase() === "false") {
      return false
    }
  }
  return undefined
}

export default class MyParcelModuleService extends MedusaService({
  Consignment: MyParcelConsignment,
  Setting: MyParcelSetting,
}) {
  protected logger_: Logger
  protected defaultLabelFormat?: "A4" | "A6"

  constructor({ logger }: Dependencies, moduleDeclaration: any) {
    // @ts-ignore
    super(...arguments)
    this.logger_ = logger
    this.defaultLabelFormat = normalizeLabelFormat(
      (moduleDeclaration?.options as ModuleOptions | undefined)?.default_label_format
    )
  }

  private resolveDefaultLabelFormat(settings?: { default_label_format?: string | null }) {
    return (
      normalizeLabelFormat(settings?.default_label_format) ||
      this.defaultLabelFormat ||
      DEFAULT_LABEL_FORMAT
    )
  }

  private shouldUseDeliveryDate(settings?: { use_delivery_date?: number | null }) {
    return settings?.use_delivery_date === 1
  }

  async getSettings() {
    const settings = await this.listSettings({}, { take: 1 })

    if (settings.length) {
      return settings[0]
    }

    return this.createSettings({
      environment: "production",
      default_carrier: "bpost",
      allowed_carriers: DEFAULT_ALLOWED_CARRIERS as unknown as Record<string, unknown>,
      default_label_format: this.resolveDefaultLabelFormat(),
      default_a4_position: DEFAULT_A4_POSITION,
      use_delivery_date: 0,
    } as any)
  }

  async updateMyParcelSettings(input: MyParcelSettingsInput) {
    const settings = await this.getSettings()
    const data: Record<string, unknown> = {}

    if (input.environment) {
      data.environment = input.environment
    }

    if (input.default_carrier) {
      data.default_carrier = input.default_carrier
    }

    if (input.allowed_carriers) {
      data.allowed_carriers = input.allowed_carriers as unknown as Record<string, unknown>
    }

    if (input.default_label_format) {
      data.default_label_format = input.default_label_format
    }

    if (typeof input.default_a4_position === "number") {
      data.default_a4_position = input.default_a4_position
    }

    if (typeof input.use_delivery_date !== "undefined") {
      const flag = toBooleanFlag(input.use_delivery_date)
      if (typeof flag === "boolean") {
        data.use_delivery_date = flag ? 1 : 0
      }
    }

    if (input.api_key) {
      const key = getEncryptionKey()
      data.api_key_enc = encryptSecret(input.api_key, key)
      data.api_key_last4 = input.api_key.slice(-4)
    }

    return this.updateSettings({ id: settings.id, ...data } as any)
  }

  async testConnection() {
    const settings = await this.getSettings()
    const apiKey = this.getApiKey(settings)

    await myparcelJsonRequest("/shipments", {
      apiKey,
      environment: settings.environment || "production",
      userAgent: "medusa-myparcel",
    })
  }

  getApiKey(settings: any) {
    if (!settings?.api_key_enc) {
      throw new Error("MyParcel API key is not configured")
    }

    const key = getEncryptionKey()
    return decryptSecret(settings.api_key_enc, key)
  }

  async exportOrder(order: OrderLike, input: CreateConsignmentInput = {}) {
    const settings = await this.getSettings()
    const apiKey = this.getApiKey(settings)

    const existing = await this.listConsignments({ order_id: order.id }, { take: 1 })
    if (existing.length) {
      return existing[0]
    }

    const orderSelection = resolveMyParcelSelection(order)
    const overrideSelection =
      (input as any).selection_override ||
      (input as any).selectionOverride ||
      input.selection
    const normalizedOverride =
      overrideSelection && typeof overrideSelection === "object"
        ? (overrideSelection as MyParcelDeliverySelection)
        : undefined
    const forceOverride = Boolean((input as any).force_override || (input as any).forceOverride)

    let selection: MyParcelDeliverySelection | undefined = orderSelection
    if (forceOverride) {
      if (orderSelection || normalizedOverride || input.carrier) {
        selection = {
          ...(orderSelection || {}),
          ...(normalizedOverride || {}),
        }
        if (input.carrier && !normalizedOverride?.carrier) {
          selection.carrier = input.carrier
        }
      } else {
        selection = undefined
      }
    } else if (!orderSelection && normalizedOverride) {
      selection = normalizedOverride
    }

    const carrier = forceOverride
      ? normalizedOverride?.carrier ||
        input.carrier ||
        orderSelection?.carrier ||
        settings.default_carrier ||
        "bpost"
      : selection?.carrier || input.carrier || settings.default_carrier || "bpost"
    const carrierId = CARRIER_IDS[carrier as CarrierKey]

    if (!carrierId) {
      throw new Error("Unsupported carrier")
    }

    const address = order.shipping_address
    if (!address?.address_1 || !address.city || !address.postal_code || !address.country_code) {
      throw new Error("Order shipping address is incomplete")
    }

    const cc = address.country_code.toUpperCase()
    const { street, number, suffix } = parseStreet(address.address_1, address.address_2)

    if (["NL", "BE"].includes(cc) && !number) {
      throw new Error("House number is required for NL/BE shipments")
    }

    const shipment: any = {
      carrier: carrierId,
      reference_identifier: order.display_id ? String(order.display_id) : order.id,
      recipient: {
        cc,
        city: address.city,
        postal_code: address.postal_code,
        street: street || address.address_1,
        number: number ? String(number) : undefined,
        number_suffix: suffix || undefined,
        region: address.province || undefined,
        email: order.email || undefined,
        phone: address.phone || undefined,
        person: formatRecipientName(address, order.email || undefined),
        company: address.company || undefined,
      },
      options: {
        package_type: 1,
      },
      physical_properties: {
        weight: calculateWeight(order.items),
      },
    }

    if (selection) {
      const options = shipment.options as Record<string, unknown>
      const deliveryType = normalizeDeliveryTypeId(
        selection.delivery_type || (selection.is_pickup ? "pickup" : undefined)
      )
      if (deliveryType) {
        options.delivery_type = deliveryType
      }
      if (selection.date && carrier === "postnl" && this.shouldUseDeliveryDate(settings)) {
        options.delivery_date = normalizeDeliveryDate(selection.date)
      }
      Object.assign(options, mapShipmentOptions(selection.shipment_options))

      if (selection.is_pickup) {
        if (!selection.pickup) {
          throw new Error(
            "Pickup selection is missing pickup location details. Use Force override to provide pickup data."
          )
        }
        const pickupPayload = await buildPickupPayload(selection, {
          carrier,
          cc,
          postal_code: address.postal_code,
          city: address.city || undefined,
          street: street || address.address_1 || undefined,
          number: number ? String(number) : undefined,
        })
        const missing = missingPickupFields(pickupPayload as Record<string, unknown>)
        if (missing.length) {
          throw new Error(
            `Pickup selection is missing required fields (${missing.join(
              ", "
            )}). Use Force override to provide pickup data.`
          )
        }
        shipment.pickup = pickupPayload
      }
    }

    if (input.options) {
      Object.assign(shipment.options, input.options)
    }

    const response = await myparcelJsonRequest(
      "/shipments",
      {
        apiKey,
        environment: settings.environment || "production",
        userAgent: "medusa-myparcel",
      },
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.shipment+json;charset=utf-8",
        },
        body: JSON.stringify({ data: { shipments: [shipment] } }),
      }
    )

    const shipmentResponse =
      response?.data?.shipments?.[0] ||
      response?.shipments?.[0] ||
      response?.data?.shipment ||
      response?.data?.[0]
    const myparcelId = normalizeMyParcelId(
      shipmentResponse?.id ??
        response?.data?.ids?.[0] ??
        response?.ids?.[0] ??
        response?.data?.id ??
        response?.id
    )

    const consignment = await this.createConsignments({
      order_id: order.id,
      carrier,
      myparcel_id: myparcelId,
      reference: shipmentResponse?.reference_identifier || shipment.reference_identifier,
      status: normalizeStatus(shipmentResponse?.status) || "concept",
      barcode: shipmentResponse?.barcode || null,
      track_trace_url: shipmentResponse?.track_trace_url || null,
      label_format:
        input.label_format || this.resolveDefaultLabelFormat(settings),
      label_position: input.label_position || settings.default_a4_position || DEFAULT_A4_POSITION,
      options_json: shipment.options,
      recipient_snapshot_json: address,
      last_synced_at: new Date(),
    })

    return consignment
  }

  async registerConsignment(consignmentId: string) {
    const consignment = await this.retrieveConsignment(consignmentId)
    const settings = await this.getSettings()

    const format =
      normalizeLabelFormat(consignment.label_format) ||
      this.resolveDefaultLabelFormat(settings)
    const position = consignment.label_position ?? settings.default_a4_position ?? DEFAULT_A4_POSITION

    await this.getLabel(consignmentId, {
      format,
      position,
    })

    return this.updateConsignments({
      id: consignmentId,
      status: "registered",
      last_synced_at: new Date(),
    })
  }

  async getLabel(
    consignmentId: string,
    options: { format?: "A4" | "A6"; position?: number }
  ) {
    const consignment = await this.retrieveConsignment(consignmentId)
    const settings = await this.getSettings()
    const apiKey = this.getApiKey(settings)

    if (!consignment.myparcel_id) {
      throw new Error("Consignment has no MyParcel id")
    }

    const settingsFormat = normalizeLabelFormat(settings?.default_label_format)
    const format =
      options.format ||
      settingsFormat ||
      normalizeLabelFormat(consignment.label_format) ||
      this.resolveDefaultLabelFormat(settings)
    const position =
      options.position ||
      consignment.label_position ||
      settings.default_a4_position ||
      DEFAULT_A4_POSITION

    const query = new URLSearchParams({ format })
    if (format === "A4" && position) {
      query.set("positions", String(position))
    }

    const shipmentId = String(consignment.myparcel_id).trim()
    if (!/^\d+$/.test(shipmentId)) {
      throw new Error(
        `Consignment has an invalid MyParcel id (${shipmentId}). Re-export the shipment to recover.`
      )
    }
    const labelBasePath = `/shipment_labels/${shipmentId}`
    const labelPathWithQuery = query.toString()
      ? `${labelBasePath}?${query.toString()}`
      : labelBasePath

    const requestConfig = {
      apiKey,
      environment: settings.environment || "production",
      userAgent: "medusa-myparcel",
    }

    const fetchPdf = (path: string) => myparcelPdfRequest(path, requestConfig)
    const fetchLink = (path: string) =>
      myparcelJsonRequest(path, requestConfig, {
        headers: {
          Accept: "application/vnd.shipment_label_link+json; charset=utf8",
        },
      })

    let pdf: Buffer | undefined
    let lastError: unknown

    try {
      pdf = await fetchPdf(labelPathWithQuery)
    } catch (error) {
      lastError = error
    }

    if (!pdf) {
      try {
        pdf = await fetchPdf(labelBasePath)
      } catch (error) {
        lastError = error
      }
    }

    if (!pdf) {
      let linkResponse: any
      try {
        linkResponse = await fetchLink(labelPathWithQuery)
      } catch (error) {
        lastError = error
        linkResponse = await fetchLink(labelBasePath)
      }

      const link =
        linkResponse?.data?.pdfs?.url ||
        linkResponse?.pdfs?.url ||
        linkResponse?.data?.url ||
        linkResponse?.url
      if (!link || typeof link !== "string") {
        throw lastError
      }

      const response = await fetch(link, {
        method: "GET",
        headers: {
          Authorization: `basic ${encodeApiKey(apiKey)}`,
          "User-Agent": "medusa-myparcel",
          Accept: "application/pdf",
        },
      })
      if (!response.ok) {
        throw lastError
      }
      const arrayBuffer = await response.arrayBuffer()
      pdf = Buffer.from(arrayBuffer)
    }

    await this.updateConsignments({
      id: consignmentId,
      status: consignment.status || "registered",
      label_format: format,
      label_position: position,
      last_synced_at: new Date(),
    })

    return pdf
  }

  async emailReturnLabel(consignmentId: string, email: string, name?: string) {
    const consignment = await this.retrieveConsignment(consignmentId)
    const settings = await this.getSettings()
    const apiKey = this.getApiKey(settings)

    if (!consignment.myparcel_id) {
      throw new Error("Consignment has no MyParcel id")
    }

    if (consignment.carrier !== "bpost") {
      throw new Error("Return labels are only available for bpost on SendMyParcel.be")
    }

    const payload = {
      parent: Number(consignment.myparcel_id),
      carrier: CARRIER_IDS.bpost,
      email,
      name: name || email,
    }

    await myparcelJsonRequest(
      "/shipments",
      {
        apiKey,
        environment: settings.environment || "production",
        userAgent: "medusa-myparcel",
      },
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.return_shipment+json;charset=utf-8",
        },
        body: JSON.stringify({ data: { return_shipments: [payload] } }),
      }
    )

    return this.updateConsignments({
      id: consignmentId,
      return_label_sent_at: new Date(),
      return_label_email_status: "sent",
    })
  }

  async refreshTrackTrace(consignmentId: string) {
    const consignment = await this.retrieveConsignment(consignmentId)
    const settings = await this.getSettings()
    const apiKey = this.getApiKey(settings)

    if (!consignment.myparcel_id) {
      throw new Error("Consignment has no MyParcel id")
    }

    const response = await myparcelJsonRequest(
      `/shipments/${consignment.myparcel_id}`,
      {
        apiKey,
        environment: settings.environment || "production",
        userAgent: "medusa-myparcel",
      }
    )

    const shipment = response?.data?.shipments?.[0] || response?.shipments?.[0] || response?.data

    const normalizedStatus = normalizeStatus(shipment?.status)

    return this.updateConsignments({
      id: consignmentId,
      status: normalizedStatus || consignment.status,
      barcode: shipment?.barcode || consignment.barcode,
      track_trace_url: shipment?.track_trace_url || consignment.track_trace_url,
      track_trace_status: normalizedStatus || consignment.track_trace_status,
      track_trace_history_json: shipment || response,
      last_synced_at: new Date(),
    })
  }
}
