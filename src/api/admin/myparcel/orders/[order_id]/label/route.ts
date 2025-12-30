import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService } from "../../../helpers"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const orderId = req.params.order_id

  const consignments = await service.listConsignments({ order_id: orderId }, { take: 1 })
  const consignment = consignments[0]

  if (!consignment) {
    res.status(404).json({ message: "Consignment not found" })
    return
  }

  const format = req.query.format ? String(req.query.format).toUpperCase() : undefined
  const position = req.query.position ? Number(req.query.position) : undefined

  const pdf = await service.getLabel(consignment.id, {
    format: format === "A6" ? "A6" : format === "A4" ? "A4" : undefined,
    position,
  })

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader(
    "Content-Disposition",
    `inline; filename=label-${orderId}-${consignment.id}.pdf`
  )
  res.send(pdf)
}
