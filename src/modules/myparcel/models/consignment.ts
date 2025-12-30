import { model } from "@medusajs/framework/utils"

export const MyParcelConsignment = model.define("myparcel_consignment", {
  id: model.id({ prefix: "mpc" }).primaryKey(),
  order_id: model.text().unique().index(),
  fulfillment_id: model.text().nullable(),
  carrier: model.text().nullable(),
  myparcel_id: model.text().index().nullable(),
  reference: model.text().nullable(),
  status: model.text().nullable(),
  barcode: model.text().index().nullable(),
  track_trace_url: model.text().nullable(),
  track_trace_status: model.text().nullable(),
  label_format: model.text().nullable(),
  label_position: model.number().nullable(),
  options_json: model.json().nullable(),
  recipient_snapshot_json: model.json().nullable(),
  track_trace_history_json: model.json().nullable(),
  errors_json: model.json().nullable(),
  last_synced_at: model.dateTime().nullable(),
  return_label_sent_at: model.dateTime().nullable(),
  return_label_email_status: model.text().nullable(),
})
