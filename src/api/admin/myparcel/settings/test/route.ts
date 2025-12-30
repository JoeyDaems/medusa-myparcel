import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService } from "../../helpers"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)

  await service.testConnection()

  res.json({ ok: true })
}
