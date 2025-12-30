import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { MyParcelFulfillmentService } from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [MyParcelFulfillmentService],
})
