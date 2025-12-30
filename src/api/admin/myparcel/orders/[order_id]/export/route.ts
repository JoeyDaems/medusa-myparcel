import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService, retrieveOrder } from "../../../helpers"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const orderId = req.params.order_id
  const order = await retrieveOrder(req, orderId)

  const consignment = await service.exportOrder(order, req.body || {})

  res.json({ consignment })
}
