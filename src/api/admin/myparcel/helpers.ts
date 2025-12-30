import type { MedusaRequest } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import type MyParcelModuleService from "../../../modules/myparcel/service"
import { resolveMyParcelSelection } from "../../../modules/myparcel/utils/selection"

export function getMyParcelService(req: MedusaRequest): MyParcelModuleService {
  return req.scope.resolve("myparcel") as MyParcelModuleService
}

export function getOrderService(req: MedusaRequest): IOrderModuleService {
  return req.scope.resolve("order") as IOrderModuleService
}

export async function retrieveOrder(req: MedusaRequest, orderId: string) {
  const orderService = getOrderService(req)

  return orderService.retrieveOrder(orderId, {
    relations: ["shipping_address", "items", "shipping_methods"],
  })
}

export function resolveOrderMyParcelSelection(order: {
  shipping_methods?: Array<{ data?: Record<string, unknown> | null }> | null
}) {
  return resolveMyParcelSelection(order)
}
