import { hash, verify } from '@node-rs/argon2'
import bcrypt from 'bcryptjs'

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const

export type PasswordVerification = {
  valid: boolean
  needsRehash: boolean
}

export function isArgon2Hash(value: string): boolean {
  return value.startsWith('$argon2id$')
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<PasswordVerification> {
  if (isArgon2Hash(storedHash)) {
    return {
      valid: await verify(storedHash, password),
      needsRehash: false,
    }
  }

  if (storedHash.startsWith('$2')) {
    const valid = await bcrypt.compare(password, storedHash)
    return { valid, needsRehash: valid }
  }

  return { valid: false, needsRehash: false }
}
