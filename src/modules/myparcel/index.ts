import { Module } from "@medusajs/framework/utils"
import MyParcelModuleService from "./service"

export const MYPARCEL_MODULE = "myparcel"

export default Module(MYPARCEL_MODULE, {
  service: MyParcelModuleService,
})
