import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
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
import { useEffect, useState } from "react"
import { sdk } from "../../../lib/sdk"

type Settings = {
  api_key_configured?: boolean
  api_key_last4?: string
  environment?: string
  default_carrier?: string
  allowed_carriers?: string[]
  default_label_format?: "A4" | "A6"
  default_a4_position?: number
  use_delivery_date?: boolean
}

const MyParcelSettingsPage = () => {
  const { data, refetch } = useQuery<{ settings: Settings }>({
    queryKey: [["myparcel-settings"]],
    queryFn: () => sdk.client.fetch(`/admin/myparcel/settings`),
  })

  const settings = data?.settings

  const [apiKey, setApiKey] = useState("")
  const [environment, setEnvironment] = useState("production")
  const [defaultCarrier, setDefaultCarrier] = useState("bpost")
  const [labelFormat, setLabelFormat] = useState<"A4" | "A6">("A6")
  const [labelPosition, setLabelPosition] = useState(1)
  const [useDeliveryDate, setUseDeliveryDate] = useState(false)

  useEffect(() => {
    if (settings?.environment) setEnvironment(settings.environment)
    if (settings?.default_carrier) setDefaultCarrier(settings.default_carrier)
    if (settings?.default_label_format === "A4" || settings?.default_label_format === "A6") {
      setLabelFormat(settings.default_label_format)
    }
    if (typeof settings?.default_a4_position === "number") {
      setLabelPosition(settings.default_a4_position)
    }
    if (typeof settings?.use_delivery_date === "boolean") {
      setUseDeliveryDate(settings.use_delivery_date)
    }
  }, [settings])

  const { mutateAsync: saveSettings, isPending: isSaving } = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/myparcel/settings`, {
        method: "PUT",
        body: {
          api_key: apiKey || undefined,
          environment,
          default_carrier: defaultCarrier,
          default_label_format: labelFormat,
          default_a4_position: labelPosition,
          use_delivery_date: useDeliveryDate,
        },
      }),
    onSuccess: () => {
      toast.success("MyParcel settings saved")
      setApiKey("")
      refetch()
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to save settings")
    },
  })

  const { mutateAsync: testConnection, isPending: isTesting } = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/myparcel/settings`, {
        method: "POST",
      }),
    onSuccess: () => toast.success("MyParcel connection OK"),
    onError: (error: any) =>
      toast.error(error?.message || "MyParcel connection failed"),
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">MyParcel Settings</Heading>
      </div>
      <div className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-col gap-1">
          <Text>API key</Text>
          <Input
            type="password"
            value={apiKey}
            placeholder={
              settings?.api_key_configured
                ? `Configured (ending ${settings.api_key_last4})`
                : "Paste API key"
            }
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Select value={environment} onValueChange={setEnvironment}>
            <Select.Trigger>
              <Select.Value placeholder="Environment" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="production">Production</Select.Item>
              <Select.Item value="sandbox">Sandbox</Select.Item>
            </Select.Content>
          </Select>

          <Select value={defaultCarrier} onValueChange={setDefaultCarrier}>
            <Select.Trigger>
              <Select.Value placeholder="Default carrier" />
            </Select.Trigger>
            <Select.Content>
              {(settings?.allowed_carriers || ["postnl", "bpost", "dpd"]).map(
                (carrier) => (
                  <Select.Item key={carrier} value={carrier}>
                    {carrier.toUpperCase()}
                  </Select.Item>
                )
              )}
            </Select.Content>
          </Select>

          <Select value={labelFormat} onValueChange={(value) => setLabelFormat(value as "A4" | "A6")}>
            <Select.Trigger>
              <Select.Value placeholder="Default label format" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="A6">A6</Select.Item>
              <Select.Item value="A4">A4</Select.Item>
            </Select.Content>
          </Select>

          <Input
            type="number"
            min={1}
            max={4}
            value={labelPosition}
            onChange={(event) => setLabelPosition(Number(event.target.value))}
            placeholder="A4 start position"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-ui-border-base px-4 py-3">
          <div className="flex flex-col gap-1">
            <Text size="small" weight="plus">
              Use delivery date (PostNL only)
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              When enabled, selected delivery dates are sent for PostNL shipments.
            </Text>
          </div>
          <Switch
            checked={useDeliveryDate}
            onCheckedChange={(next) => setUseDeliveryDate(Boolean(next))}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => saveSettings()} isLoading={isSaving}>
            Save settings
          </Button>
          <Button variant="secondary" onClick={() => testConnection()} isLoading={isTesting}>
            Test connection
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "MyParcel",
})

export default MyParcelSettingsPage
