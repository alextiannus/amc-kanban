import { Annotation } from "@langchain/langgraph";

export const StateAnnotation = Annotation.Root({
  brandId: Annotation<string>(),
  taskId: Annotation<string>(),
  platform: Annotation<string>(),
  caption: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  mediaUrls: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  hashtags: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  status: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "in_progress"
  }),
  compliancePassed: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => true
  }),
  complianceReason: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  approved: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => false
  }),
  publishedUrl: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  error: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  watermarkText: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  draftId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  copywriteOnly: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => false
  }),
  mediaFromDraft: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => false
  }),
  researchNotes: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  marketingStrategy: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0
  }),
  aiFailed: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => false
  }),
  requireAmcContent: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => false
  }),
  skipAmcContent: Annotation<boolean>({
    reducer: (x, y) => y !== undefined ? y : x,
    default: () => false
  }),
  actorId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  actorType: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  actorRole: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  assigneeId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  assetIds: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => []
  }),
  contentEngine: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => ""
  }),
  provenance: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  quality: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null
  })
});
