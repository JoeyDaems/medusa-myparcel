import type { InferEntityType } from "@medusajs/framework/types"
import { MyParcelConsignment } from "./models/consignment"
import { MyParcelSetting } from "./models/settings"
import type { CarrierKey } from "./constants"

export type MyParcelConsignmentEntity = InferEntityType<typeof MyParcelConsignment>
export type MyParcelSettingEntity = InferEntityType<typeof MyParcelSetting>

export type MyParcelEnvironment = "production" | "sandbox"

export type MyParcelSettingsInput = {
  api_key?: string
  environment?: MyParcelEnvironment
  default_carrier?: CarrierKey
  allowed_carriers?: CarrierKey[]
  default_label_format?: "A4" | "A6"
  default_a4_position?: number
  use_delivery_date?: boolean
}

export type CreateConsignmentInput = {
  carrier?: CarrierKey
  label_format?: "A4" | "A6"
  label_position?: number
  options?: Record<string, unknown>
  force_override?: boolean
  selection_override?: MyParcelDeliverySelection
  selection?: MyParcelDeliverySelection
}

export type MyParcelDeliverySelection = {
  platform?: string
  carrier?: CarrierKey | string
  is_pickup?: boolean
  delivery_type?: string | number
  date?: string
  time_frame?: {
    start?: string
    end?: string
  }
  package_type?: string
  shipment_options?: Record<string, boolean>
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
  selected_price?: {
    amount?: number
    currency?: string
  }
}
