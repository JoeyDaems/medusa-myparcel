import { MyParcelFulfillmentService } from "../src/providers/myparcel-fulfillment/service"

type Logger = {
  warn: (message: string) => void
}

const logger: Logger = {
  warn: (message) => {
    console.warn(message)
  },
}

const assertEqual = (label: string, actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`${label} failed: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const run = async () => {
  const service = new MyParcelFulfillmentService({ logger })
  const optionData = {
    fallback_prices: { standard: 500 },
    free_shipping_thresholds: { NL: 10000 },
  }

  const baseContext = {
    shipping_address: { country_code: "nl" },
  }

  const priceBelow = await service.calculatePrice(
    optionData,
    {},
    {
      ...baseContext,
      item_total: 75,
    }
  )
  assertEqual("below threshold price", priceBelow.calculated_amount, 5)

  const priceAbove = await service.calculatePrice(
    optionData,
    {},
    {
      ...baseContext,
      item_total: 150,
    }
  )
  assertEqual("above threshold price", priceAbove.calculated_amount, 0)

  const priceFromItems = await service.calculatePrice(
    optionData,
    {},
    {
      ...baseContext,
      items: [{ item_total: 60 }, { item_total: 55 }],
    }
  )
  assertEqual("items total threshold price", priceFromItems.calculated_amount, 0)
}

run()
  .then(() => {
    console.log("free-shipping test: ok")
  })
  .catch((error) => {
    console.error("free-shipping test: failed")
    console.error(error)
    process.exit(1)
  })
