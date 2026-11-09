import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
const action = "VIDEO_ASSISTANT_RECEIPT";
const plain = (v: any) => JSON.parse(JSON.stringify(v));
export const videoReceipts = {
  async reserve(key: string, fingerprint: string, value: any) {
    return prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const resourceId = "video-assistant:" + key;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${resourceId},0))`;
        const old = await tx.auditLog.findFirst({
          where: { resourceId, action },
        });
        if (old) {
          if ((old.metadata as any)?.fingerprint !== fingerprint)
            throw Object.assign(Error("video_request_key_conflict"), {
              status: 409,
            });
          return { id: old.id, value: old.newValue, created: false };
        }
        const row = await tx.auditLog.create({
          data: {
            action,
            resourceId,
            resourceType: "Brand",
            actorId: value.userId,
            actorType: "HUMAN",
            metadata: { fingerprint, brandId: value.brandId },
            newValue: plain(value),
          },
        });
        return { id: row.id, value: row.newValue, created: true };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  },
  async lookup(key: string) {
    const r = await prisma.auditLog.findFirst({
      where: { resourceId: "video-assistant:" + key, action },
    });
    return r ? { id: r.id, value: r.newValue } : null;
  },
  async get(id: string) {
    const r = await prisma.auditLog.findFirst({ where: { id, action } });
    return r ? { id: r.id, value: r.newValue } : null;
  },
  async save(id: string, value: any) {
    await prisma.auditLog.update({
      where: { id },
      data: { newValue: plain(value) },
    });
  },
};
