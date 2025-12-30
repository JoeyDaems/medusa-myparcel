import { model } from "@medusajs/framework/utils"

export const MyParcelSetting = model.define("myparcel_setting", {
  id: model.id({ prefix: "mps" }).primaryKey(),
  api_key_enc: model.text().nullable(),
  api_key_last4: model.text().nullable(),
  environment: model.text().nullable(),
  default_carrier: model.text().nullable(),
  allowed_carriers: model.json().nullable(),
  default_label_format: model.text().nullable(),
  default_a4_position: model.number().nullable(),
  use_delivery_date: model.number().nullable(),
})
