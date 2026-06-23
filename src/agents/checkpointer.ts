import { BaseCheckpointSaver } from "@langchain/langgraph";
import type { Checkpoint, CheckpointMetadata, CheckpointTuple } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { prisma } from "../lib/prisma.ts";

export class PrismaCheckpointer extends BaseCheckpointSaver {
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = config.configurable?.checkpoint_id;

    if (!threadId) {
      return undefined;
    }

    let checkpointRecord;
    if (checkpointId) {
      checkpointRecord = await prisma.brandAgentCheckpoint.findUnique({
        where: {
          threadId_checkpointId: {
            threadId,
            checkpointId,
          },
        },
      });
    } else {
      checkpointRecord = await prisma.brandAgentCheckpoint.findFirst({
        where: { threadId },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!checkpointRecord) {
      return undefined;
    }

    return {
      config: {
        configurable: {
          thread_id: checkpointRecord.threadId,
          checkpoint_id: checkpointRecord.checkpointId,
        },
      },
      checkpoint: checkpointRecord.checkpoint as any,
      metadata: checkpointRecord.metadata as any,
      parentConfig: checkpointRecord.parentCheckpointId
        ? {
            configurable: {
              thread_id: checkpointRecord.threadId,
              checkpoint_id: checkpointRecord.parentCheckpointId,
            },
          }
        : undefined,
    };
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: any
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      throw new Error("Missing thread_id in config.configurable");
    }

    const checkpointId = checkpoint.id;
    const parentCheckpointId = config.configurable?.checkpoint_id;

    await prisma.brandAgentCheckpoint.upsert({
      where: {
        threadId_checkpointId: {
          threadId,
          checkpointId,
        },
      },
      update: {
        checkpoint: checkpoint as any,
        metadata: metadata as any,
        parentCheckpointId,
      },
      create: {
        threadId,
        checkpointId,
        checkpoint: checkpoint as any,
        metadata: metadata as any,
        parentCheckpointId,
      },
    });

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId,
      },
    };
  }

  async putWrites(
    _config: RunnableConfig,
    _writes: any[],
    _taskId: string
  ): Promise<void> {
    return Promise.resolve();
  }

  async *list(
    config: RunnableConfig,
    before?: any,
    limit?: number
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) {
      return;
    }

    const beforeId = before?.configurable?.checkpoint_id;

    let records;
    if (beforeId) {
      const beforeRecord = await prisma.brandAgentCheckpoint.findUnique({
        where: {
          threadId_checkpointId: {
            threadId,
            checkpointId: beforeId,
          },
        },
      });
      if (!beforeRecord) return;

      records = await prisma.brandAgentCheckpoint.findMany({
        where: {
          threadId,
          createdAt: {
            lt: beforeRecord.createdAt,
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } else {
      records = await prisma.brandAgentCheckpoint.findMany({
        where: { threadId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    }

    for (const record of records) {
      yield {
        config: {
          configurable: {
            thread_id: record.threadId,
            checkpoint_id: record.checkpointId,
          },
        },
        checkpoint: record.checkpoint as any,
        metadata: record.metadata as any,
        parentConfig: record.parentCheckpointId
          ? {
              configurable: {
                thread_id: record.threadId,
                checkpoint_id: record.parentCheckpointId,
              },
            }
          : undefined,
      };
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    await prisma.brandAgentCheckpoint.deleteMany({
      where: { threadId },
    });
  }
}
