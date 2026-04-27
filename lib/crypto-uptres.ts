import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-cbc'

function getKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

export function encrypt(text: string, secret: string): string {
  const key = getKey(secret)
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(data: string, secret: string): string {
  const [ivHex, encHex] = data.split(':')
  const key = getKey(secret)
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
