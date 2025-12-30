import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getMyParcelService } from "../helpers"

function sanitizeSettings(settings: any) {
  return {
    id: settings.id,
    environment: settings.environment,
    default_carrier: settings.default_carrier,
    allowed_carriers: settings.allowed_carriers,
    default_label_format: settings.default_label_format,
    default_a4_position: settings.default_a4_position,
    use_delivery_date: settings.use_delivery_date === 1,
    api_key_configured: !!settings.api_key_enc,
    api_key_last4: settings.api_key_last4,
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const settings = await service.getSettings()

  res.json({ settings: sanitizeSettings(settings) })
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)
  const body = (req.body || {}) as Record<string, any>

  if (typeof body.api_key === "string" && !body.api_key.trim()) {
    delete body.api_key
  }

  const settings = await service.updateMyParcelSettings(body)
  res.json({ settings: sanitizeSettings(settings) })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = getMyParcelService(req)

  await service.testConnection()

  res.json({ ok: true })
}
