// AND-4: strict integrity for tracked Play Store PNGs. A plausible PNG
// signature and IHDR are not evidence of a decodable browser screenshot.
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function validatePlayPng(bytes, viewportWidth = 360, viewportHeight = 640) {
  const fail = () => { throw new Error('AND-4: invalid or corrupt Play PNG') }
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 ||
      !bytes.subarray(0, 8).equals(signature)) fail()
  let offset = 8
  let width = 0, height = 0, depth = 0, color = 0
  let seenIHDR = false, seenPLTE = false, seenIDAT = false
  let endedIDAT = false, seenIEND = false
  const idats = []
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail()
    const length = bytes.readUInt32BE(offset)
    if (length > bytes.length - offset - 12) fail()
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase() ||
        (type[0] === type[0].toUpperCase() && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type))) fail()
    const data = offset + 8, crcOffset = data + length
    if (bytes.readUInt32BE(crcOffset) !== crc32(bytes.subarray(offset + 4, crcOffset))) fail()
    if (!seenIHDR) {
      if (type !== 'IHDR' || length !== 13) fail()
      width = bytes.readUInt32BE(data)
      height = bytes.readUInt32BE(data + 4)
      depth = bytes[data + 8]
      color = bytes[data + 9]
      const allowedDepth = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
      if (!allowedDepth[color]?.includes(depth) || bytes[data + 10] !== 0 ||
          bytes[data + 11] !== 0 || bytes[data + 12] !== 0) fail()
      seenIHDR = true
    } else if (type === 'IHDR') fail()
    if (type === 'PLTE') {
      const entries = length / 3
      if (seenPLTE || seenIDAT || seenIEND || color === 0 || color === 4 ||
          !length || length % 3 || length > 768 || (color === 3 && entries > 2 ** depth)) fail()
      seenPLTE = true
    }
    if (seenIDAT && type !== 'IDAT') endedIDAT = true
    if (type === 'IDAT') {
      if (seenIEND || endedIDAT || (color === 3 && !seenPLTE)) fail()
      seenIDAT = true
      idats.push(bytes.subarray(data, crcOffset))
    }
    if (type === 'IEND') {
      if (length !== 0 || !seenIDAT || crcOffset + 4 !== bytes.length) fail()
      seenIEND = true
      break
    }
    offset = crcOffset + 4
  }
  if (!seenIHDR || !seenIDAT || !seenIEND || width <= 0 || height <= 0) fail()
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const rowBytes = Math.ceil(width * channels[color] * depth / 8)
  const maxRaw = 32 * 1024 * 1024
  if (!Number.isSafeInteger(rowBytes) || rowBytes <= 0 ||
      (rowBytes + 1) * height > maxRaw) fail()
  let raw
  try { raw = inflateSync(Buffer.concat(idats), { maxOutputLength: maxRaw }) }
  catch { fail() }
  const stride = rowBytes + 1
  if (raw.length !== stride * height) fail()
  for (let y = 0; y < height; y++) if (raw[y * stride] > 4) fail()
  const scale = width / viewportWidth
  if (!Number.isInteger(scale) || scale !== 3 ||
      height !== viewportHeight * scale) fail()
  return { width, height, scale }
}

export function assertUniquePlayShots(entries) {
  const hashes = new Map()
  for (const { name, bytes } of entries) {
    const hash = createHash('sha256').update(bytes).digest('hex')
    const previous = hashes.get(hash)
    if (previous !== undefined) {
      throw new Error('AND-4: duplicate or stale Play PNG: ' + previous + ' and ' + name)
    }
    hashes.set(hash, name)
  }
}
