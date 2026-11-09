import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { VideoActor, createVideoAssistant } from "./core";
const id = z.string().trim().min(1).max(200);
const requestKey = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
const base = { brandId: id },
  project = { ...base, projectId: id };
const versioned = {
  ...project,
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  requestKey,
};
const source = z
  .object({
    creativeId: id,
    month: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}$/)
      .optional(),
    expectedRevision: versioned.expectedRevision,
  })
  .strict();
const publication = {
  accountId: id,
  caption: z.string().trim().min(1).max(20000),
  hashtags: z.array(z.string().max(100)).max(40).optional(),
  draftId: id.optional(),
  expectedDraftRevision: versioned.expectedRevision.optional(),
  source: source.optional(),
};
const draft = {
  ...base,
  requestKey,
  publication: z.object(publication).strict().optional(),
  prompt: z.string().trim().min(1).max(20000),
  title: z.string().trim().min(1).max(200).optional(),
  assetIds: z
    .array(id)
    .max(40)
    .refine((v) => new Set(v).size === v.length, "Duplicate assets"),
  language: z.enum(["zh", "en", "id", "ms"]),
  platform: z.enum(["tiktok", "instagram", "facebook", "xiaohongshu"]),
  durationSec: z.number().int().min(1).max(180),
  aspectRatio: z.enum(["9:16", "4:5", "1:1"]),
};
export const VIDEO_TOOLS = {
  video_prepare_post: {
    title: "准备视频发布草稿",
    description:
      "Bind an approved owned video to one real target account and a versioned draft. Requires complete caption and current video revision; existing drafts also require expectedDraftRevision. Does not publish. Optional source pins the current calendar creative version; it is a relation, not fidelity proof.",
    permission: "draft.create",
    effect: "write",
    shape: { ...versioned, ...publication },
  },
  post_get_delivery: {
    title: "查看发布草稿与投递结果",
    description:
      "Read a brand draft revision, account, scheduled/published status and latest delivery job. Queued or scheduled is not published. Unknown results must be reconciled, never automatically resubmitted.",
    permission: "draft.read",
    effect: "read",
    shape: { ...base, draftId: id },
  },
  post_request_submission: {
    title: "确认发布内容与排期",
    description:
      "Request a human-only submission confirmation for this exact draft revision and smart schedule. The tool never approves or publishes. Present confirmationUrl; after the user approves, read post_get_delivery for the original queue result.",
    permission: "draft.submit",
    effect: "write",
    shape: {
      ...base,
      draftId: id,
      expectedDraftRevision: versioned.expectedRevision,
      requestKey,
    },
  },
  video_create_draft: {
    title: "创建营销视频草稿",
    description:
      "Create an owned video draft from an explicit script/brief and authorized brand asset IDs. No rendering or publication. Keep the returned projectId. Inspect actual supported duration/model restrictions in errors; never invent successful creation.",
    permission: "content.video-making.create",
    effect: "write",
    shape: draft,
  },
  video_revise_draft: {
    title: "修改营销视频草稿",
    description:
      "Create a successor draft using the complete revised brief and explicitly selected assets/settings. Requires current expectedRevision; retains the old project and its results. It does not regenerate or translate an existing video with identical visuals.",
    permission: "content.video-making.create",
    effect: "write",
    shape: {
      ...draft,
      projectId: id,
      expectedRevision: versioned.expectedRevision,
    },
  },
  video_list_projects: {
    title: "查找我的视频制作",
    description:
      "List up to 50 currently accessible video drafts, filtered to the connected owner. Read projectId to resume; the page is not exhaustive.",
    permission: "content.video-making.read",
    effect: "read",
    shape: base,
  },
  video_get_project: {
    title: "查看视频制作进度",
    description:
      "Read the original owned video project, script, current revision, actual progress and errors. Never create another task just to check progress.",
    permission: "content.video-making.read",
    effect: "read",
    shape: project,
  },
  video_request_generation: {
    title: "确认视频制作费用",
    description:
      "Estimate the current video and return a human confirmation URL. The assistant cannot approve or submit paid generation. Ask the user to open the URL, review script/material rights and price, and confirm. After confirmation use video_get_project.",
    permission: "content.video-making.generate",
    effect: "write",
    shape: versioned,
  },
  video_stop: {
    title: "停止视频制作",
    description:
      "Request stopping the current owned video. Does not guarantee cancellation of already accepted provider work or a refund.",
    permission: "content.video-making.update",
    effect: "write",
    shape: versioned,
  },
  video_request_review: {
    title: "审核视频成片",
    description:
      "When assembly completes, return a human review URL. The user watches and approves the current output; the assistant cannot approve. No social publication.",
    permission: "content.video-making.update",
    effect: "write",
    shape: versioned,
  },
  video_get_output: {
    title: "下载已审核视频",
    description:
      "Retrieve authenticated download links only for current assembled videos approved by the human and saved in the brand library. Completion is not publication.",
    permission: "content.video-making.read",
    effect: "read",
    shape: project,
  },
} as const;
export type VideoToolName = keyof typeof VIDEO_TOOLS;
export type VideoService = ReturnType<typeof createVideoAssistant>;
export function registerVideoTools(
  server: McpServer,
  resolveActor: () => Promise<VideoActor | null>,
  service: VideoService,
) {
  for (const [name, tool] of Object.entries(VIDEO_TOOLS)) {
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: z.object(tool.shape).strict(),
        annotations: {
          readOnlyHint: tool.effect === "read",
          destructiveHint: name === "video_stop",
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          const actor = await resolveActor();
          if (!actor)
            throw Object.assign(Error("AUTH_REQUIRED"), { status: 401 });
          const result = await service.call(actor, name, input);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            isError:
              result.ok === false && result.state !== "reconciliation_required",
            structuredContent: result,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : "VIDEO_UNAVAILABLE",
                  status: (error as any)?.status || 500,
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );
  }
}
