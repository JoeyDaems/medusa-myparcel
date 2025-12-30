const fs = require("fs")
const path = require("path")

let target
try {
  // Works with hoisted installs as well (yarn/npm/pnpm).
  target = require.resolve("buffer-equal-constant-time")
} catch {
  target = path.join(
    __dirname,
    "..",
    "node_modules",
    "buffer-equal-constant-time",
    "index.js"
  )
}

if (!fs.existsSync(target)) {
  process.exit(0)
}

const source = fs.readFileSync(target, "utf8")
const needle = "var SlowBuffer = require('buffer').SlowBuffer;"
const replacement = "var SlowBuffer = require('buffer').SlowBuffer || Buffer;"

if (!source.includes(needle)) {
  process.exit(0)
}

const updated = source.replace(needle, replacement)
fs.writeFileSync(target, updated, "utf8")
