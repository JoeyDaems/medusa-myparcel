const DEFAULT_BASE_URL = "https://api.sendmyparcel.be"

export type MyParcelClientConfig = {
  apiKey: string
  environment?: string
  userAgent?: string
}

export function getApiBaseUrl(environment?: string): string {
  const override = process.env.MYPARCEL_API_BASE_URL
  if (override) {
    return override
  }

  return DEFAULT_BASE_URL
}

export function encodeApiKey(apiKey: string): string {
  return Buffer.from(apiKey, "utf8").toString("base64")
}

type RequestOptions = {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export async function myparcelJsonRequest(
  path: string,
  { apiKey, environment, userAgent }: MyParcelClientConfig,
  options: RequestOptions = {}
): Promise<any> {
  const baseUrl = getApiBaseUrl(environment)
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `basic ${encodeApiKey(apiKey)}`,
      "User-Agent": userAgent || "medusa-myparcel",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`MyParcel request failed (${response.status}): ${text}`)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export async function myparcelPdfRequest(
  path: string,
  { apiKey, environment, userAgent }: MyParcelClientConfig
): Promise<Buffer> {
  const baseUrl = getApiBaseUrl(environment)
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `basic ${encodeApiKey(apiKey)}`,
      "User-Agent": userAgent || "medusa-myparcel",
      Accept: "application/pdf",
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`MyParcel label request failed (${response.status}): ${text}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
