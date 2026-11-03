import { prisma } from './prisma'
import { resolveSessionOrApiKey } from './user-management/auth'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from './brandAccess'
import { calendarNotesHandlers } from './calendarNotesHttp'

export const calendarNotes = calendarNotesHandlers({
  db: prisma,
  authenticate: resolveSessionOrApiKey,
  canRead: (id, actor) => canSessionAccessBrandProject(id, actor.id, actor.type, actor.role),
  canWrite: (id, actor) => canSessionWriteBrandProject(id, actor.id, actor.type),
})
