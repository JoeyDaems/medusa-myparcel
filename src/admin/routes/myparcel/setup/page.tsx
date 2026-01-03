import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CogSixTooth } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { sdk } from "../../../lib/sdk"

type ServiceZone = {
  id: string
  name: string
}

type ShippingProfile = {
  id: string
  name: string
}

type ShippingOption = {
  id: string
  name: string
  service_zone?: { id: string; name: string }
  shipping_profile?: { id: string; name: string }
  data?: Record<string, unknown> | null
}

type SetupResponse = {
  service_zones: ServiceZone[]
  shipping_profiles: ShippingProfile[]
  shipping_options: ShippingOption[]
}

const DEFAULT_PRICES = {
  standard: 0,
  morning: 0,
  evening: 0,
  pickup: 0,
  express: 0,
}

const CARRIERS = ["bpost", "dpd", "postnl"] as const

type FallbackPrices = typeof DEFAULT_PRICES
type FallbackPricesByCarrier = Record<(typeof CARRIERS)[number], FallbackPrices>
type FreeShippingThresholdRow = {
  id: string
  country: string
  amount: number
}

const clonePrices = (): FallbackPrices => ({ ...DEFAULT_PRICES })
const toCents = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0

const toMajor = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value / 100
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed / 100 : undefined
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if ("value" in record) {
      return toMajor(record.value)
    }
    if ("raw" in record) {
      return toMajor(record.raw)
    }
  }
  return undefined
}

const MyParcelSetupPage = () => {
  const { data, isLoading, refetch } = useQuery<SetupResponse>({
    queryKey: [["myparcel-setup"]],
    queryFn: () => sdk.client.fetch(`/admin/myparcel/setup`),
  })

  const thresholdIdRef = useRef(0)
  const makeThresholdRow = (country = "", amount = 0): FreeShippingThresholdRow => ({
    id: `threshold-${thresholdIdRef.current++}`,
    country,
    amount,
  })

  const [serviceZoneId, setServiceZoneId] = useState<string | undefined>()
  const [shippingProfileId, setShippingProfileId] = useState<string | undefined>()
  const [name, setName] = useState("MyParcel Delivery")
  const [fallbackPrices, setFallbackPrices] = useState(DEFAULT_PRICES)
  const [freeShippingThresholds, setFreeShippingThresholds] = useState<
    FreeShippingThresholdRow[]
  >([])
  const [useCarrierPricing, setUseCarrierPricing] = useState(false)
  const [fallbackPricesByCarrier, setFallbackPricesByCarrier] = useState<FallbackPricesByCarrier>(() =>
    CARRIERS.reduce((acc, carrier) => {
      acc[carrier] = clonePrices()
      return acc
    }, {} as FallbackPricesByCarrier)
  )

  const updateCarrierPrice = (carrier: (typeof CARRIERS)[number], key: keyof FallbackPrices, value: number) => {
    setFallbackPricesByCarrier((prev) => ({
      ...prev,
      [carrier]: {
        ...(prev[carrier] ?? clonePrices()),
        [key]: value,
      },
    }))
  }

  useEffect(() => {
    if (!serviceZoneId || !data?.shipping_options) {
      return
    }

    const match = data.shipping_options.find(
      (option) => option.service_zone?.id === serviceZoneId
    )
    const thresholds =
      (match?.data?.free_shipping_thresholds as Record<string, unknown> | undefined) ??
      (match?.data?.freeShippingThresholds as Record<string, unknown> | undefined)

    if (!thresholds || typeof thresholds !== "object") {
      setFreeShippingThresholds([])
      return
    }

    const rows = Object.entries(thresholds)
      .map(([country, value]) => {
        const amount = toMajor(value)
        if (amount === undefined) {
          return null
        }
        return makeThresholdRow(String(country).toUpperCase(), amount)
      })
      .filter((row): row is FreeShippingThresholdRow => Boolean(row))

    setFreeShippingThresholds(rows)
  }, [data, serviceZoneId])

  const thresholdPayload = useMemo(() => {
    return freeShippingThresholds.reduce<Record<string, number>>((acc, row) => {
      const code = row.country.trim().toUpperCase()
      if (!code) {
        return acc
      }
      acc[code] = toCents(row.amount)
      return acc
    }, {})
  }, [freeShippingThresholds])

  const serviceZoneOptions = useMemo(
    () =>
      (data?.service_zones || []).map((zone) => ({
        label: zone.name,
        value: zone.id,
      })),
    [data]
  )

  const shippingProfileOptions = useMemo(
    () =>
      (data?.shipping_profiles || []).map((profile) => ({
        label: profile.name,
        value: profile.id,
      })),
    [data]
  )

  const { mutateAsync: createOption, isPending } = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/myparcel/setup`, {
        method: "POST",
        body: {
          name,
          service_zone_id: serviceZoneId,
          shipping_profile_id: shippingProfileId,
          fallback_prices: fallbackPrices,
          free_shipping_thresholds: thresholdPayload,
          ...(useCarrierPricing
            ? { fallback_prices_by_carrier: fallbackPricesByCarrier }
            : {}),
        },
      }),
    onSuccess: () => {
      toast.success("MyParcel shipping option saved")
      refetch()
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to create shipping option")
    },
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">MyParcel setup</Heading>
        {data?.shipping_options?.length ? (
          <Badge>{data.shipping_options.length} options</Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 px-6 py-4">
        {isLoading && <Text>Loading setup data...</Text>}
        {!isLoading && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select value={serviceZoneId} onValueChange={setServiceZoneId}>
                <Select.Trigger>
                  <Select.Value placeholder="Service zone" />
                </Select.Trigger>
                <Select.Content>
                  {serviceZoneOptions.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Select value={shippingProfileId} onValueChange={setShippingProfileId}>
                <Select.Trigger>
                  <Select.Value placeholder="Shipping profile" />
                </Select.Trigger>
                <Select.Content>
                  {shippingProfileOptions.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>

            <Input value={name} onChange={(event) => setName(event.target.value)} />
            <Text size="small" className="text-ui-fg-subtle">
              Base prices are in cents. SendMyParcel surcharges are added on top during checkout.
            </Text>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Input
                type="number"
                placeholder="Standard (base)"
                value={fallbackPrices.standard}
                onChange={(event) =>
                  setFallbackPrices({ ...fallbackPrices, standard: Number(event.target.value) })
                }
              />
              <Input
                type="number"
                placeholder="Morning (base)"
                value={fallbackPrices.morning}
                onChange={(event) =>
                  setFallbackPrices({ ...fallbackPrices, morning: Number(event.target.value) })
                }
              />
              <Input
                type="number"
                placeholder="Evening (base)"
                value={fallbackPrices.evening}
                onChange={(event) =>
                  setFallbackPrices({ ...fallbackPrices, evening: Number(event.target.value) })
                }
              />
              <Input
                type="number"
                placeholder="Pickup (base)"
                value={fallbackPrices.pickup}
                onChange={(event) =>
                  setFallbackPrices({ ...fallbackPrices, pickup: Number(event.target.value) })
                }
              />
              <Input
                type="number"
                placeholder="Express (base)"
                value={fallbackPrices.express}
                onChange={(event) =>
                  setFallbackPrices({ ...fallbackPrices, express: Number(event.target.value) })
                }
              />
            </div>

            <div className="mt-2">
              <Text size="small" weight="plus">
                Free shipping thresholds (EUR)
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                Applied to tax-inclusive item total (excluding shipping).
              </Text>
            </div>

            <div className="flex flex-col gap-3">
              {freeShippingThresholds.length ? (
                freeShippingThresholds.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <Input
                      placeholder="Country code"
                      value={row.country}
                      onChange={(event) => {
                        const value = event.target.value.toUpperCase()
                        setFreeShippingThresholds((prev) =>
                          prev.map((item, rowIndex) =>
                            rowIndex === index ? { ...item, country: value } : item
                          )
                        )
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Amount (EUR)"
                      value={row.amount}
                      onChange={(event) => {
                        const nextAmount = Number(event.target.value)
                        setFreeShippingThresholds((prev) =>
                          prev.map((item, rowIndex) =>
                            rowIndex === index ? { ...item, amount: nextAmount } : item
                          )
                        )
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setFreeShippingThresholds((prev) =>
                          prev.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <Text size="small" className="text-ui-fg-subtle">
                  No free shipping thresholds configured yet.
                </Text>
              )}

              <Button
                variant="secondary"
                onClick={() =>
                  setFreeShippingThresholds((prev) => [...prev, makeThresholdRow()])
                }
              >
                Add threshold
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-ui-border-base px-4 py-3">
              <div className="flex flex-col gap-1">
                <Text size="small" weight="plus">
                  Carrier-specific base prices
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  Optional. Overrides the base price per carrier.
                </Text>
              </div>
              <Switch
                checked={useCarrierPricing}
                onCheckedChange={(next) => setUseCarrierPricing(Boolean(next))}
              />
            </div>

            {useCarrierPricing && (
              <div className="flex flex-col gap-3">
                {CARRIERS.map((carrier) => (
                  <div key={carrier} className="rounded-lg border border-ui-border-base p-3">
                    <Text size="small" weight="plus" className="capitalize">
                      {carrier}
                    </Text>
                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                      <Input
                        type="number"
                        placeholder="Standard"
                        value={fallbackPricesByCarrier[carrier]?.standard ?? 0}
                        onChange={(event) =>
                          updateCarrierPrice(carrier, "standard", Number(event.target.value))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Morning"
                        value={fallbackPricesByCarrier[carrier]?.morning ?? 0}
                        onChange={(event) =>
                          updateCarrierPrice(carrier, "morning", Number(event.target.value))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Evening"
                        value={fallbackPricesByCarrier[carrier]?.evening ?? 0}
                        onChange={(event) =>
                          updateCarrierPrice(carrier, "evening", Number(event.target.value))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Pickup"
                        value={fallbackPricesByCarrier[carrier]?.pickup ?? 0}
                        onChange={(event) =>
                          updateCarrierPrice(carrier, "pickup", Number(event.target.value))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Express"
                        value={fallbackPricesByCarrier[carrier]?.express ?? 0}
                        onChange={(event) =>
                          updateCarrierPrice(carrier, "express", Number(event.target.value))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Button
                variant="primary"
                disabled={!serviceZoneId || !shippingProfileId || !name}
                onClick={() => createOption()}
                isLoading={isPending}
              >
                Create MyParcel shipping option
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Heading level="h2">Existing MyParcel options</Heading>
              {data?.shipping_options?.length ? (
                <div className="flex flex-col gap-2 text-sm text-ui-fg-subtle">
                  {data.shipping_options.map((option) => (
                    <div key={option.id}>
                      <span className="font-medium text-ui-fg-base">{option.name}</span>{" "}
                      <span>
                        · {option.service_zone?.name || option.service_zone?.id} ·{" "}
                        {option.shipping_profile?.name || option.shipping_profile?.id}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="small">No MyParcel shipping options yet.</Text>
              )}
            </div>
          </>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "MyParcel setup",
  icon: CogSixTooth,
})

export default MyParcelSetupPage
