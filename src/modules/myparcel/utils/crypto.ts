import crypto from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

export function getEncryptionKey(): Buffer {
  const raw = process.env.MYPARCEL_SETTINGS_ENCRYPTION_KEY

  if (!raw) {
    throw new Error(
      "MYPARCEL_SETTINGS_ENCRYPTION_KEY is required to store MyParcel settings"
    )
  }

  let key: Buffer

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex")
  } else {
    key = Buffer.from(raw, "base64")
  }

  if (key.length !== 32) {
    throw new Error(
      "MYPARCEL_SETTINGS_ENCRYPTION_KEY must be 32 bytes (base64 or hex)"
    )
  }

  return key
}

export function encryptSecret(value: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decryptSecret(payload: string, key: Buffer): string {
  const buffer = Buffer.from(payload, "base64")

  if (buffer.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted payload")
  }

  const iv = buffer.subarray(0, IV_LENGTH)
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}
