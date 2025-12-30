export function parseStreet(address1?: string | null, address2?: string | null) {
  const raw = (address1 || "").trim()
  if (!raw) {
    return { street: "", number: null as string | null, suffix: null as string | null }
  }

  const normalized = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim()
  const address2Normalized = (address2 || "").replace(/,/g, " ").replace(/\s+/g, " ").trim()

  // Common case in checkout forms: number in address_1 and street in address_2.
  if (/^\d+[a-zA-Z]{0,5}$/.test(normalized) && address2Normalized) {
    const numberMatch = address2Normalized.match(/^(\d+)\s*([^\s]*)\s+(.*)$/)
    if (numberMatch) {
      return {
        street: (numberMatch[3] || address2Normalized).trim(),
        number: numberMatch[1],
        suffix: (numberMatch[2] || "").trim() || null,
      }
    }
    return { street: address2Normalized, number: normalized, suffix: null }
  }

  // Street + number at the end: "Downing Street 10A"
  const trailing = normalized.match(/^(.*?)[ ]+(\d+)\s*([^\s]*)$/)
  if (trailing) {
    const street = (trailing[1] || "").trim()
    const number = (trailing[2] || "").trim()
    const suffix = (trailing[3] || "").trim() || null
    if (street && number) {
      return { street, number, suffix }
    }
  }

  // Number first: "10A Downing Street"
  const leading = normalized.match(/^(\d+)\s*([^\s]*)\s+(.*)$/)
  if (leading) {
    const number = (leading[1] || "").trim()
    const suffix = (leading[2] || "").trim() || null
    const street = (leading[3] || "").trim()
    if (street && number) {
      return { street, number, suffix }
    }
  }

  if (address2) {
    const numMatch = address2.match(/\d+/)
    if (numMatch) {
      return { street: raw, number: numMatch[0], suffix: address2.replace(numMatch[0], "").trim() || null }
    }
  }

  return { street: raw, number: null, suffix: null }
}
