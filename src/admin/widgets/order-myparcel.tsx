import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  Switch,
  Textarea,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { sdk } from "../lib/sdk"

type OrderData = {
  id: string
  display_id?: number
}

type Consignment = {
  id: string
  status?: string
  barcode?: string
  track_trace_url?: string
  carrier?: string
  label_format?: string
  label_position?: number
  last_synced_at?: string
  return_label_sent_at?: string
}

type Settings = {
  default_carrier?: string
  allowed_carriers?: string[]
  default_a4_position?: number
}

type Selection = {
  carrier?: string
  is_pickup?: boolean
  delivery_type?: string | number
  date?: string
  time_frame?: {
    start?: string
    end?: string
  }
  pickup?: {
    location_code?: string | null
    retail_network_id?: string | null
    location_name?: string | null
    address?: {
      cc?: string | null
      city?: string | null
      number?: string | null
      postal_code?: string | null
      street?: string | null
    }
  }
}

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  morning: "Morning",
  standard: "Standard",
  evening: "Evening",
  pickup: "Pickup",
  express: "Express",
}

const DELIVERY_TYPE_ID_LABELS: Record<number, string> = {
  1: "Morning",
  2: "Standard",
  3: "Evening",
  4: "Pickup",
  7: "Express",
}

function formatDeliveryType(selection?: Selection | null) {
  if (!selection) {
    return undefined
  }
  if (selection.is_pickup) {
    return "Pickup"
  }
  const raw = selection.delivery_type
  if (typeof raw === "number") {
    return DELIVERY_TYPE_ID_LABELS[raw] || String(raw)
  }
  if (typeof raw === "string") {
    return DELIVERY_TYPE_LABELS[raw.toLowerCase()] || raw
  }
  return undefined
}

function formatTimeFrame(selection?: Selection | null) {
  if (!selection?.time_frame) {
    return undefined
  }
  const start = selection.time_frame.start
  const end = selection.time_frame.end
  if (start && end) {
    return `${start} - ${end}`
  }
  return start || end
}

function formatPickupSummary(selection?: Selection | null) {
  const pickup = selection?.pickup
  if (!pickup) {
    return undefined
  }
  const parts: string[] = []
  const name = pickup.location_name || pickup.location_code
  if (name) {
    parts.push(String(name))
  }
  const street = pickup.address?.street
  const number = pickup.address?.number
  const line = [street, number].filter(Boolean).join(" ")
  if (line) {
    parts.push(line)
  }
  const postal = pickup.address?.postal_code
  const city = pickup.address?.city
  const cityLine = [postal, city].filter(Boolean).join(" ")
  if (cityLine) {
    parts.push(cityLine)
  }
  return parts.join(", ")
}

const OrderMyParcelWidget = ({ data }: { data: OrderData }) => {
  const queryClient = useQueryClient()
  const orderId = data.id

  const { data: settingsData } = useQuery<{ settings: Settings }>({
    queryKey: [["myparcel-settings"]],
    queryFn: () => sdk.client.fetch(`/admin/myparcel/settings`),
  })

  const { data: consignmentData, isLoading } = useQuery<{
    consignment: Consignment | null
    selection?: Selection | null
  }>({
    queryKey: [["myparcel-consignment", orderId]],
    queryFn: () => sdk.client.fetch(`/admin/myparcel/orders/${orderId}/consignment`),
  })

  const consignment = consignmentData?.consignment || null
  const selection = consignmentData?.selection || null
  const settings = settingsData?.settings
  const hasMyParcelSelection = Boolean(selection)

  const [labelPosition, setLabelPosition] = useState(1)
  const [carrier, setCarrier] = useState<string | undefined>(undefined)
  const [forceOverride, setForceOverride] = useState(false)
  const [overrideSelectionText, setOverrideSelectionText] = useState("")
  const [overrideSelection, setOverrideSelection] = useState<Record<string, unknown> | undefined>(
    undefined
  )
  const [overrideSelectionError, setOverrideSelectionError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof settings?.default_a4_position === "number") {
      setLabelPosition(settings.default_a4_position)
    }
  }, [settings?.default_a4_position])

  useEffect(() => {
    if (forceOverride) {
      return
    }
    if (selection?.carrier) {
      setCarrier(String(selection.carrier))
      return
    }
    if (settings?.default_carrier) {
      setCarrier(settings.default_carrier)
    }
  }, [selection, settings, forceOverride])

  useEffect(() => {
    if (!forceOverride) {
      return
    }
    if (overrideSelectionText.trim()) {
      return
    }
    if (selection) {
      setOverrideSelectionText(JSON.stringify(selection, null, 2))
    }
  }, [forceOverride, selection, overrideSelectionText])

  useEffect(() => {
    const raw = overrideSelectionText.trim()
    if (!raw) {
      setOverrideSelection(undefined)
      setOverrideSelectionError(null)
      return
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (!parsed || typeof parsed !== "object") {
        setOverrideSelection(undefined)
        setOverrideSelectionError("Override JSON must be an object.")
        return
      }
      setOverrideSelection(parsed)
      setOverrideSelectionError(null)
    } catch (error) {
      setOverrideSelection(undefined)
      setOverrideSelectionError("Invalid JSON.")
    }
  }, [overrideSelectionText])

  const carrierOptions = useMemo(() => {
    return (settings?.allowed_carriers || ["postnl", "bpost", "dpd"]).map((value) => ({
      label: value.toUpperCase(),
      value,
    }))
  }, [settings])

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: [["myparcel-consignment", orderId]],
    })

  const { mutateAsync: exportOrder, isPending: isExporting } = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { carrier }
      if (forceOverride) {
        body.force_override = true
        if (overrideSelection) {
          body.selection_override = overrideSelection
        }
      }
      return sdk.client.fetch(`/admin/myparcel/orders/${orderId}/export`, {
        method: "POST",
        body,
      })
    },
    onSuccess: () => {
      toast.success("Shipment exported to MyParcel")
      invalidate()
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to export shipment")
    },
  })

  const { mutateAsync: registerShipment, isPending: isRegistering } = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/myparcel/orders/${orderId}/register`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Shipment registered")
      invalidate()
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to register shipment")
    },
  })

  const { mutateAsync: refreshStatus, isPending: isRefreshing } = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/myparcel/orders/${orderId}/track-trace/refresh`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Track & trace updated")
      invalidate()
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to refresh status")
    },
  })

  const { mutateAsync: sendReturnLabel, isPending: isSendingReturn } = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/myparcel/orders/${orderId}/return-label/email`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Return label emailed")
      invalidate()
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to email return label")
    },
  })

  const handleDownloadLabel = () => {
    const query = new URLSearchParams({
      position: String(labelPosition),
    })

    window.open(`/admin/myparcel/orders/${orderId}/label?${query.toString()}`, "_blank")
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">MyParcel</Heading>
        {consignment?.status && <Badge>{consignment.status}</Badge>}
      </div>
      <div className="flex flex-col gap-4 px-6 py-4">
        {isLoading && <Text>Loading shipment info...</Text>}
        {!isLoading && !consignment && (
          <Text>No shipment exported yet for this order.</Text>
        )}
        {consignment && (
          <div className="flex flex-col gap-2 text-sm text-ui-fg-subtle">
            <div>Carrier: {consignment.carrier?.toUpperCase()}</div>
            {consignment.barcode && <div>Barcode: {consignment.barcode}</div>}
            {consignment.track_trace_url && (
              <a
                className="text-ui-fg-interactive"
                href={consignment.track_trace_url}
                target="_blank"
                rel="noreferrer"
              >
                Track & trace
              </a>
            )}
          </div>
        )}

        {selection && (
          <div className="rounded-lg border border-ui-border-base p-3">
            <Text size="small" weight="plus">
              Checkout selection
            </Text>
            <div className="mt-2 flex flex-col gap-1 text-sm text-ui-fg-subtle">
              {selection.carrier && (
                <div>Carrier: {String(selection.carrier).toUpperCase()}</div>
              )}
              {formatDeliveryType(selection) && (
                <div>Delivery: {formatDeliveryType(selection)}</div>
              )}
              {selection.date && <div>Date: {selection.date}</div>}
              {formatTimeFrame(selection) && (
                <div>Time: {formatTimeFrame(selection)}</div>
              )}
              {formatPickupSummary(selection) && (
                <div>Pickup: {formatPickupSummary(selection)}</div>
              )}
            </div>
          </div>
        )}
        {!selection && (
          <Text size="small" className="text-ui-fg-subtle">
            No MyParcel checkout selection found for this order.
          </Text>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-ui-border-base px-4 py-3">
            <div className="flex flex-col gap-1">
              <Text size="small" weight="plus">
                Force override
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                Allows changing the checkout selection for this shipment.
              </Text>
            </div>
            <Switch checked={forceOverride} onCheckedChange={(next) => setForceOverride(Boolean(next))} />
          </div>

          {forceOverride && (
            <div className="flex flex-col gap-2">
              <Text size="small" weight="plus">
                Selection override (JSON)
              </Text>
              <Textarea
                value={overrideSelectionText}
                onChange={(event) => setOverrideSelectionText(event.target.value)}
                placeholder='{"carrier":"bpost","is_pickup":false,"delivery_type":"standard"}'
                rows={6}
              />
              {overrideSelectionError && (
                <Text size="small" className="text-ui-fg-error">
                  {overrideSelectionError}
                </Text>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              value={carrier}
              onValueChange={setCarrier}
              disabled={Boolean(selection) && !forceOverride}
            >
              <Select.Trigger>
                <Select.Value placeholder="Carrier" />
              </Select.Trigger>
              <Select.Content>
                {carrierOptions.map((option) => (
                  <Select.Item key={option.value} value={option.value}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Input
              type="number"
              min={1}
              max={4}
              value={labelPosition}
              onChange={(event) => setLabelPosition(Number(event.target.value))}
              placeholder="A4 position"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => exportOrder()}
              isLoading={isExporting}
              disabled={!hasMyParcelSelection || Boolean(forceOverride && overrideSelectionError)}
            >
              Export to MyParcel
            </Button>
            <Button
              variant="secondary"
              onClick={() => registerShipment()}
              isLoading={isRegistering}
              disabled={!consignment}
            >
              Register
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadLabel}
              disabled={!consignment}
            >
              Download label
            </Button>
            <Button
              variant="secondary"
              onClick={() => sendReturnLabel()}
              isLoading={isSendingReturn}
              disabled={!consignment}
            >
              Email return label
            </Button>
            <Button
              variant="transparent"
              onClick={() => refreshStatus()}
              isLoading={isRefreshing}
              disabled={!consignment}
            >
              Refresh status
            </Button>
          </div>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderMyParcelWidget
