import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
function key(){
  const value=process.env.MODEL_CONFIG_ENCRYPTION_KEY
  if(!value||! /^[a-fA-F0-9]{64}$/.test(value))throw new Error('MODEL_CONFIG_ENCRYPTION_KEY must be a 32-byte hexadecimal infrastructure key')
  return Buffer.from(value,'hex')
}
export function secretFingerprint(value:string){return createHash('sha256').update(value).digest('hex')}
export function encryptSecret(value:string){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),nonce)
  const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
  return ['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.')
}
export function decryptSecret(value:string){
  const [version,nonce,tag,body]=value.split('.')
  if(version!=='v1'||!nonce||!tag||!body)throw new Error('Unsupported encrypted model credential')
  const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(nonce,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'))
  return Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8')
}
