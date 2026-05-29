import crypto from 'crypto'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  brandId?: string
  taskId?: string
  userId?: string
}

export interface ChatConversation {
  id: string
  brandId?: string
  taskId?: string
  userId: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

const conversations = new Map<string, ChatConversation>()

export function createConversation(input: {
  brandId?: string
  taskId?: string
  userId: string
}): ChatConversation {
  const now = new Date().toISOString()
  const conversation: ChatConversation = {
    id: crypto.randomUUID(),
    brandId: input.brandId,
    taskId: input.taskId,
    userId: input.userId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  conversations.set(conversation.id, conversation)
  return conversation
}

export function getConversation(conversationId: string): ChatConversation | null {
  return conversations.get(conversationId) ?? null
}

export function getOrCreateConversation(input: {
  conversationId?: string
  brandId?: string
  taskId?: string
  userId: string
}): ChatConversation {
  if (input.conversationId) {
    const existing = conversations.get(input.conversationId)
    if (existing) {
      if (input.brandId) existing.brandId = input.brandId
      if (input.taskId) existing.taskId = input.taskId
      existing.updatedAt = new Date().toISOString()
      return existing
    }
  }

  return createConversation({
    brandId: input.brandId,
    taskId: input.taskId,
    userId: input.userId,
  })
}

export function appendMessage(conversationId: string, input: {
  role: ChatRole
  content: string
  brandId?: string
  taskId?: string
  userId?: string
}): ChatMessage | null {
  const conversation = conversations.get(conversationId)
  if (!conversation) return null

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
    brandId: input.brandId,
    taskId: input.taskId,
    userId: input.userId,
  }

  conversation.messages.push(message)
  conversation.updatedAt = message.createdAt
  return message
}

export function listMessages(conversationId: string): ChatMessage[] {
  return conversations.get(conversationId)?.messages ?? []
}
