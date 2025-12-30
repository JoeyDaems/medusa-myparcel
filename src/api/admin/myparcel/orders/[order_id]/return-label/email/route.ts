import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService, retrieveOrder } from "../../../../helpers"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const orderId = req.params.order_id

  const order = await retrieveOrder(req, orderId)

  const consignments = await service.listConsignments({ order_id: orderId }, { take: 1 })
  const consignment = consignments[0]

  if (!consignment) {
    res.status(404).json({ message: "Consignment not found" })
    return
  }

  if (!order.email) {
    res.status(400).json({ message: "Order email is missing" })
    return
  }

  const name = [order.shipping_address?.first_name, order.shipping_address?.last_name]
    .filter(Boolean)
    .join(" ")

  const updated = await service.emailReturnLabel(consignment.id, order.email, name)

  res.json({ consignment: updated })
}
