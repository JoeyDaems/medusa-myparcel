export const CARRIER_IDS = {
  postnl: 1,
  bpost: 2,
  dpd: 4,
} as const

export type CarrierKey = keyof typeof CARRIER_IDS

export const DEFAULT_ALLOWED_CARRIERS: CarrierKey[] = [
  "postnl",
  "bpost",
  "dpd",
]

export const DEFAULT_LABEL_FORMAT = "A6"
export const DEFAULT_A4_POSITION = 1
