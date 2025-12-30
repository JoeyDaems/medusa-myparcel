import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService } from "../../../../helpers"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const orderId = req.params.order_id

  const consignments = await service.listConsignments({ order_id: orderId }, { take: 1 })
  const consignment = consignments[0]

  if (!consignment) {
    res.status(404).json({ message: "Consignment not found" })
    return
  }

  const updated = await service.refreshTrackTrace(consignment.id)

  res.json({ consignment: updated })
}
