import type { MedusaRequest } from "@medusajs/framework/http"
import type MyParcelModuleService from "../../../modules/myparcel/service"

export function getMyParcelService(req: MedusaRequest): MyParcelModuleService {
  return req.scope.resolve("myparcel") as MyParcelModuleService
}

export function getCartService(req: MedusaRequest) {
  return req.scope.resolve("cart")
}
