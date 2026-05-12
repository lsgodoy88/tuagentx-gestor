import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto-uptres'

const SECRET = 'test-secret-32-bytes-padding-xxx'

describe('lib/crypto-uptres — AES-256-CBC con IV aleatorio', () => {
  describe('encrypt + decrypt round-trip', () => {
    it('texto simple ASCII', () => {
      const plain = 'hello world'
      expect(decrypt(encrypt(plain, SECRET), SECRET)).toBe(plain)
    })

    it('API key real de UpTres (formato típico)', () => {
      const plain = 'uptres-key-prod-abc123def456'
      expect(decrypt(encrypt(plain, SECRET), SECRET)).toBe(plain)
    })

    it('string vacío', () => {
      expect(decrypt(encrypt('', SECRET), SECRET)).toBe('')
    })

    it('Unicode (emoji + acentos)', () => {
      const plain = 'café ☕ niño piñata 中文'
      expect(decrypt(encrypt(plain, SECRET), SECRET)).toBe(plain)
    })

    it('texto largo (>1KB)', () => {
      const plain = 'x'.repeat(2048)
      expect(decrypt(encrypt(plain, SECRET), SECRET)).toBe(plain)
    })
  })

  describe('formato del cifrado', () => {
    it('output es "ivHex:ciphertextHex"', () => {
      const c = encrypt('test', SECRET)
      expect(c).toMatch(/^[a-f0-9]+:[a-f0-9]+$/)
      const [ivHex, encHex] = c.split(':')
      expect(ivHex.length).toBe(32) // IV de 16 bytes = 32 hex chars
      expect(encHex.length).toBeGreaterThan(0)
    })

    it('IV es aleatorio: mismo plaintext + secret → ciphertexts diferentes', () => {
      const plain = 'same-input'
      const a = encrypt(plain, SECRET)
      const b = encrypt(plain, SECRET)
      const c = encrypt(plain, SECRET)
      expect(a).not.toBe(b)
      expect(b).not.toBe(c)
      // Pero los 3 desencriptan al mismo plaintext
      expect(decrypt(a, SECRET)).toBe(plain)
      expect(decrypt(b, SECRET)).toBe(plain)
      expect(decrypt(c, SECRET)).toBe(plain)
    })
  })

  describe('seguridad', () => {
    it('secret incorrecto NO desencripta correctamente (tira o devuelve basura)', () => {
      const c = encrypt('sensitive-data', SECRET)
      let resultado: string | Error
      try {
        resultado = decrypt(c, 'secret-incorrecto')
      } catch (e) {
        resultado = e as Error
      }
      // Cualquier opción es válida (error o basura), lo crítico es que NO sea el plaintext
      expect(resultado).not.toBe('sensitive-data')
    })

    it('ciphertext modificado falla al desencriptar', () => {
      const c = encrypt('original', SECRET)
      // Cambiar el último byte hex del ciphertext
      const tampered = c.slice(0, -2) + (c.slice(-2) === 'ff' ? '00' : 'ff')
      expect(() => decrypt(tampered, SECRET)).toThrow()
    })

    it('IV modificado produce plaintext distinto o falla', () => {
      const c = encrypt('original-text-padded-to-block', SECRET)
      const [iv, enc] = c.split(':')
      const tamperedIv = (iv[0] === '0' ? 'f' : '0') + iv.slice(1)
      const tampered = `${tamperedIv}:${enc}`
      let resultado: string | Error
      try { resultado = decrypt(tampered, SECRET) } catch (e) { resultado = e as Error }
      expect(resultado).not.toBe('original-text-padded-to-block')
    })
  })
})
