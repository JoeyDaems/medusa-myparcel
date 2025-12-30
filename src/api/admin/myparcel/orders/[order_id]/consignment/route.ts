import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService, resolveOrderMyParcelSelection, retrieveOrder } from "../../../helpers"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const orderId = req.params.order_id

  const consignments = await service.listConsignments({ order_id: orderId }, { take: 1 })
  const order = await retrieveOrder(req, orderId)
  const selection = resolveOrderMyParcelSelection(order)

  res.json({ consignment: consignments[0] || null, selection: selection || null })
}
