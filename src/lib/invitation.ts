import crypto from 'crypto'

export interface InvitationData {
  email: string
  username: string
  password: string
  welcomeMessage: string
  createdAt: number
}

const ENCRYPTION_KEY = process.env.INVITATION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

// 生成邀请链接中的加密 token
export function generateInvitationToken(data: InvitationData): string {
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  
  const json = JSON.stringify(data)
  let encrypted = cipher.update(json, 'utf-8', 'hex')
  encrypted += cipher.final('hex')
  
  // 返回 iv + encrypted 的 base64
  const combined = iv.toString('hex') + ':' + encrypted
  return Buffer.from(combined).toString('base64url')
}

// 解密邀请 token 获取数据
export function decryptInvitationToken(token: string): InvitationData | null {
  try {
    const combined = Buffer.from(token, 'base64url').toString('hex')
    const [ivHex, encrypted] = combined.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32)
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
    decrypted += decipher.final('utf-8')
    
    return JSON.parse(decrypted)
  } catch (error) {
    console.error('Failed to decrypt invitation token:', error)
    return null
  }
}

// 生成完整的邀请链接
export function generateInvitationLink(
  email: string,
  password: string,
  username: string = email.split('@')[0],
  baseUrl: string = process.env.NEXT_PUBLIC_KANBAN_HOST || 'http://localhost:3000'
): { link: string; token: string } {
  const welcomeMessage = `欢迎 ${username}！\n\n您已被邀请加入 AMC Kanban 看板系统。\n请使用以下凭证登录：\n\n用户名/邮箱: ${email}\n密码: ${password}`
  
  const data: InvitationData = {
    email,
    username,
    password,
    welcomeMessage,
    createdAt: Date.now()
  }
  
  const token = generateInvitationToken(data)
  const link = `${baseUrl}/invite/${token}`
  
  return { link, token }
}
