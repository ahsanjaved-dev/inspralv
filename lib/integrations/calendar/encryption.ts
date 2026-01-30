/**
 * Calendar Credentials Encryption
 * Utilities for encrypting/decrypting OAuth tokens
 */

import crypto from 'crypto'

// Encryption configuration
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32

/**
 * Get encryption key from environment
 * Falls back to a derived key if not set (not recommended for production)
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.CALENDAR_ENCRYPTION_KEY
  
  if (envKey) {
    // If key is provided, use it (should be 32 bytes hex encoded = 64 chars)
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex')
    }
    // If not hex, derive a key from it
    return crypto.scryptSync(envKey, 'calendar-salt', 32)
  }
  
  // Fallback: derive from Supabase service key (not ideal but works)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-key'
  return crypto.scryptSync(serviceKey, 'calendar-credentials', 32)
}

/**
 * Encrypt a string value
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const salt = crypto.randomBytes(SALT_LENGTH)
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    // Format: salt:iv:authTag:encrypted
    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  } catch (error) {
    console.error('[CalendarEncryption] Encryption failed:', error)
    throw new Error('Failed to encrypt value')
  }
}

/**
 * Decrypt a string value
 */
export function decrypt(encryptedValue: string): string {
  if (!encryptedValue) return ''
  
  try {
    const parts = encryptedValue.split(':')
    
    if (parts.length !== 4) {
      // Value might not be encrypted, return as-is
      console.warn('[CalendarEncryption] Value does not appear to be encrypted')
      return encryptedValue
    }
    
    const [saltHex, ivHex, authTagHex, encrypted] = parts as [string, string, string, string]
    
    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted: string = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    console.error('[CalendarEncryption] Decryption failed:', error)
    throw new Error('Failed to decrypt value')
  }
}

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 4 && (parts[0]?.length ?? 0) === SALT_LENGTH * 2
}

/**
 * Safely encrypt credentials object
 */
export function encryptCredentials(credentials: {
  clientSecret?: string
  refreshToken?: string
  accessToken?: string
}): {
  clientSecret?: string
  refreshToken?: string
  accessToken?: string
} {
  return {
    clientSecret: credentials.clientSecret ? encrypt(credentials.clientSecret) : undefined,
    refreshToken: credentials.refreshToken ? encrypt(credentials.refreshToken) : undefined,
    accessToken: credentials.accessToken ? encrypt(credentials.accessToken) : undefined,
  }
}

/**
 * Safely decrypt credentials object
 */
export function decryptCredentials(credentials: {
  client_secret?: string
  refresh_token?: string | null
  access_token?: string | null
}): {
  clientSecret?: string
  refreshToken?: string
  accessToken?: string
} {
  return {
    clientSecret: credentials.client_secret ? decrypt(credentials.client_secret) : undefined,
    refreshToken: credentials.refresh_token ? decrypt(credentials.refresh_token) : undefined,
    accessToken: credentials.access_token ? decrypt(credentials.access_token) : undefined,
  }
}

