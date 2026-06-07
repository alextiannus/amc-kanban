import crypto from 'crypto'

export interface InvitationData {
  invitationId?: string
  email: string
  username: string
  password: string
  welcomeMessage: string
  createdAt: number
  expiresAt?: number
}

function getInvitationKey() {
  const secret = process.env.INVITATION_ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('INVITATION_ENCRYPTION_KEY or JWT_SECRET is required')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

// 生成邀请链接中的加密 token
export function generateInvitationToken(data: InvitationData): string {
  const iv = crypto.randomBytes(16)
  const key = getInvitationKey()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  
  const json = JSON.stringify(data)
  let encrypted = cipher.update(json, 'utf-8', 'hex')
  encrypted += cipher.final('hex')
  
  const combined = iv.toString('hex') + ':' + encrypted
  return Buffer.from(combined, 'utf8').toString('base64url')
}

// 解密邀请 token 获取数据
export function decryptInvitationToken(token: string): InvitationData | null {
  try {
    const combined = Buffer.from(token, 'base64url').toString('utf8')
    const [ivHex, encrypted] = combined.split(':')
    if (!ivHex || !encrypted) return null
    const iv = Buffer.from(ivHex, 'hex')
    const key = getInvitationKey()
    
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
  baseUrl: string = process.env.NEXT_PUBLIC_KANBAN_HOST || 'http://localhost:3000',
  options?: { invitationId?: string; expiresAt?: number }
): { link: string; token: string } {
  const welcomeMessage = `欢迎 ${username}！\n\n您已被邀请加入 AI Marketing Crew 看板系统。\n请使用以下凭证登录：\n\n用户名/邮箱: ${email}\n密码: ${password}`
  
  const data: InvitationData = {
    invitationId: options?.invitationId,
    email,
    username,
    password,
    welcomeMessage,
    createdAt: Date.now(),
    expiresAt: options?.expiresAt,
  }
  
  const token = generateInvitationToken(data)
  const link = `${baseUrl}/invite/${token}`
  
  return { link, token }
}
