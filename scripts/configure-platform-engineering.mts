// Trusted operator entry. Transport only an encrypted envelope through Render job arguments.
import {generateKeyPairSync,privateDecrypt,constants} from 'node:crypto'
import {reportPool} from '../src/lib/platform-ai/bug-reports.ts'
import {encryptSecret,decryptSecret} from '../src/lib/model-management/secrets.ts'
import {prisma} from '../src/lib/prisma.ts'
export async function beginPlatformConfiguration(nonce:string){
  if(!/^[0-9a-f-]{36}$/.test(nonce))throw Error('invalid_nonce')
  const pool=await reportPool(),pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
  await pool.query('INSERT INTO public.amc_platform_settings(id,encrypted_config) VALUES($1,$2)',[`provision-${nonce}`,encryptSecret(JSON.stringify({privateKey:pair.privateKey,expires:Date.now()+600000}))])
  return {nonce,publicKey:pair.publicKey}
}
export async function completePlatformConfiguration(nonce:string,ciphertext:string){
  const pool=await reportPool(),client=await pool.connect()
  try{
    await client.query('BEGIN')
    const row=(await client.query('SELECT encrypted_config FROM public.amc_platform_settings WHERE id=$1 FOR UPDATE',[`provision-${nonce}`])).rows[0]
    if(!row)throw Error('provision_not_found')
    const envelope=JSON.parse(decryptSecret(row.encrypted_config));if(envelope.expires<Date.now())throw Error('provision_expired')
    const config=JSON.parse(privateDecrypt({key:envelope.privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(ciphertext,'base64')).toString('utf8'))
    if(typeof config.enabled!=='boolean'||typeof config.githubToken!=='string'||!config.githubToken)throw Error('invalid_config')
    await client.query("INSERT INTO public.amc_platform_settings(id,encrypted_config) VALUES('engineering-v1',$1) ON CONFLICT(id) DO UPDATE SET encrypted_config=excluded.encrypted_config,updated_at=now()",[encryptSecret(JSON.stringify({enabled:config.enabled,githubToken:config.githubToken}))])
    await client.query('DELETE FROM public.amc_platform_settings WHERE id=$1',[`provision-${nonce}`]);await client.query('COMMIT')
    await prisma.auditLog.create({data:{actorType:'SYSTEM',action:'platform.engineering.configured',resourceType:'PlatformEngineering',resourceId:'engineering-v1',newValue:{enabled:config.enabled,credential:'encrypted',repositories:['amc-mm','amc-kanban']}}})
    return {configured:true,enabled:config.enabled}
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
