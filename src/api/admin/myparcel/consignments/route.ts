import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService } from "../helpers"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)

  const limit = Math.min(Number(req.query.limit || 20), 100)
  const offset = Number(req.query.offset || 0)

  const filters: Record<string, any> = {}
  if (req.query.status) {
    filters.status = String(req.query.status)
  }
  if (req.query.carrier) {
    filters.carrier = String(req.query.carrier)
  }
  if (req.query.order_id) {
    filters.order_id = String(req.query.order_id)
  }

  const [consignments, count] = await service.listAndCountConsignments(filters, {
    take: limit,
    skip: offset,
  })

  res.json({ consignments, count, limit, offset })
}
