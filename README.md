# @joey-d/medusa-myparcel

IMPORTANT: This plugin is under development and should not be used for production projects.

Medusa v2 plugin that integrates MyParcel (SendMyParcel.be) delivery options, pricing, and shipment handling.

## Features
- MyParcel delivery options and pickup locations endpoint for storefront checkout.
- Fulfillment provider that calculates prices using MyParcel surcharges plus optional base prices.
- Admin UI to configure settings, create shipping options, list consignments, and manage shipments on orders.
- Consignment and settings storage with encrypted API keys.

## Compatibility
- Built against Medusa v2.12.3.
- Node >= 20, Yarn 1.22.19.

## Install

```bash
yarn add @joey-d/medusa-myparcel
```

If you are developing locally, add it via a workspace or `file:` dependency.

## Configuration

1) Register the plugin and fulfillment provider in `medusa-config.ts`:

```ts
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  plugins: [
    {
      resolve: "@joey-d/medusa-myparcel",
      options: {
        // Optional: "A4" | "A6"
        default_label_format: "A6",
      },
    },
  ],
  modules: {
    fulfillment: {
      options: {
        providers: [
          {
            resolve: "@joey-d/medusa-myparcel/providers/myparcel-fulfillment",
            id: "myparcel",
          },
        ],
      },
    },
  },
})
```

2) Set environment variables:

```bash
# Required. 32 bytes, base64 or hex.
MYPARCEL_SETTINGS_ENCRYPTION_KEY=...

# Optional. Overrides the SendMyParcel API base URL.
MYPARCEL_API_BASE_URL=https://api.sendmyparcel.be
```

3) Run your Medusa migrations (for example `yarn medusa db:migrate`).

## Admin setup

- Configure the API key and defaults in Admin -> Settings -> MyParcel.
- Create a MyParcel shipping option in Admin -> MyParcel -> Setup. Base prices are in cents and MyParcel surcharges are added at checkout.
- Use the order widget to export shipments, register labels, refresh track and trace, and email return labels.

## Storefront integration

- Fetch delivery options from `/store/myparcel/delivery-options?cart_id=...`.
  - Optional: add `carrier=postnl` (or `bpost`, `dpd`) to filter carriers.
- Store the selected MyParcel option in the shipping method data under one of:
  - `myparcel`
  - `myparcel_delivery`
  - `myparcel_selection`
- The export flow reads the selection from that data. For NL/BE addresses a house number is required.

## API endpoints

Admin:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/myparcel/settings` | Get saved settings. |
| PUT | `/admin/myparcel/settings` | Update settings (API key, defaults). |
| POST | `/admin/myparcel/settings` | Test API connection. |
| POST | `/admin/myparcel/settings/test` | Test API connection (alias). |
| GET | `/admin/myparcel/setup` | List service zones, profiles, and MyParcel options. |
| POST | `/admin/myparcel/setup` | Create or update a MyParcel shipping option. |
| GET | `/admin/myparcel/consignments` | List consignments (supports `limit`, `offset`, `status`, `carrier`, `order_id`). |
| GET | `/admin/myparcel/orders/:order_id/consignment` | Get consignment + checkout selection. |
| POST | `/admin/myparcel/orders/:order_id/export` | Export shipment to MyParcel. |
| POST | `/admin/myparcel/orders/:order_id/register` | Register shipment and generate label. |
| GET | `/admin/myparcel/orders/:order_id/label` | Download label PDF (`format`, `position`). |
| POST | `/admin/myparcel/orders/:order_id/track-trace/refresh` | Refresh track & trace. |
| POST | `/admin/myparcel/orders/:order_id/return-label/email` | Email return label (uses order email). |

Store:

| Method | Path | Description |
| --- | --- | --- |
| GET | `/store/myparcel/delivery-options` | Delivery options by cart (`cart_id`, optional `carrier`). |

## Notes
- Default carriers are PostNL, bpost, and DPD.
- Delivery options are fetched from `https://api.myparcel.nl`.
- Shipments and labels are created via the SendMyParcel API (`https://api.sendmyparcel.be`).
- Return labels are currently limited to bpost (SendMyParcel.be).

## Development

```bash
yarn dev
```

```bash
yarn build
```
