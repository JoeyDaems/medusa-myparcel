import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArchiveBox } from "@medusajs/icons"
import {
  Button,
  Container,
  DataTable,
  DataTablePaginationState,
  Heading,
  createDataTableColumnHelper,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { sdk } from "../../lib/sdk"

type Consignment = {
  id: string
  order_id: string
  status?: string
  carrier?: string
  barcode?: string
  last_synced_at?: string
}

type ConsignmentsResponse = {
  consignments: Consignment[]
  count: number
  limit: number
  offset: number
}

const columnHelper = createDataTableColumnHelper<Consignment>()

const MyParcelOverviewPage = () => {
  const limit = 20
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageSize: limit,
    pageIndex: 0,
  })

  const offset = useMemo(() => pagination.pageIndex * limit, [pagination])

  const { data, isLoading } = useQuery<ConsignmentsResponse>({
    queryKey: [["myparcel-consignments", limit, offset]],
    queryFn: () =>
      sdk.client.fetch(`/admin/myparcel/consignments`, {
        query: { limit, offset },
      }),
  })

  const columns = useMemo(
    () => [
      columnHelper.accessor("order_id", {
        header: "Order",
        cell: ({ getValue }) => {
          const orderId = getValue()
          return (
            <Link className="text-ui-fg-interactive" to={`/orders/${orderId}`}>
              {orderId}
            </Link>
          )
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => getValue() || "-",
      }),
      columnHelper.accessor("carrier", {
        header: "Carrier",
        cell: ({ getValue }) => (getValue() || "-").toUpperCase(),
      }),
      columnHelper.accessor("barcode", {
        header: "Barcode",
        cell: ({ getValue }) => getValue() || "-",
      }),
      columnHelper.accessor("last_synced_at", {
        header: "Last synced",
        cell: ({ getValue }) =>
          getValue() ? new Date(getValue() as string).toLocaleString() : "-",
      }),
    ],
    []
  )

  const table = useDataTable({
    columns,
    data: data?.consignments ?? [],
    getRowId: (row) => row.id,
    rowCount: data?.count ?? 0,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">MyParcel shipments</Heading>
        <Button size="small" variant="secondary" asChild>
          <Link to="/myparcel/setup">Setup</Link>
        </Button>
      </div>
      <DataTable instance={table}>
        <DataTable.Table />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "MyParcel",
  icon: ArchiveBox,
})

export default MyParcelOverviewPage
