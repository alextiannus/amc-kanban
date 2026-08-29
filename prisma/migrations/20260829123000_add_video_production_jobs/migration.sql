create table if not exists "VideoProductionJob" (
  "id" text primary key,
  "brandId" text not null,
  "creativeId" text,
  "title" text not null,
  "platform" text not null,
  "idea" text not null,
  "status" text not null,
  "progress" integer not null default 0,
  "thumbnailUrl" text,
  "finalVideoUrl" text,
  "narration" text,
  "musicBrief" text,
  "creatorType" text,
  "aspectRatio" text,
  "assetIds" text[] not null default array[]::text[],
  "mediaUrls" text[] not null default array[]::text[],
  "scenes" jsonb not null,
  "plan" jsonb,
  "sceneExecutions" jsonb,
  "finalExecution" jsonb,
  "error" text,
  "createdBy" text,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "VideoProductionJob_brandId_fkey"
    foreign key ("brandId") references "Brand"("id") on delete cascade on update cascade
);

create index if not exists "VideoProductionJob_brandId_status_updatedAt_idx"
  on "VideoProductionJob"("brandId", "status", "updatedAt");

create index if not exists "VideoProductionJob_brandId_creativeId_idx"
  on "VideoProductionJob"("brandId", "creativeId");
