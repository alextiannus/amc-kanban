create table if not exists "VideoShootBatch" (
  "id" text primary key,
  "brandId" text not null references "Brand"("id") on delete cascade,
  "name" text not null,
  "captureDate" timestamp(3) not null,
  "videoProjectId" text not null,
  "creativeId" text,
  "creativeVersion" integer,
  "extractionVersion" integer,
  "createdBy" text not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp
);

create unique index if not exists "VideoShootBatch_brandId_name_key" on "VideoShootBatch"("brandId", "name");
create unique index if not exists "VideoShootBatch_brandId_videoProjectId_key" on "VideoShootBatch"("brandId", "videoProjectId");
create index if not exists "VideoShootBatch_brandId_captureDate_idx" on "VideoShootBatch"("brandId", "captureDate");

alter table "MediaAsset"
  add column if not exists "shootBatchId" text,
  add column if not exists "videoProjectId" text,
  add column if not exists "creativeId" text,
  add column if not exists "creativeVersion" integer,
  add column if not exists "extractionVersion" integer,
  add column if not exists "captureDate" timestamp(3),
  add column if not exists "originalFilename" text,
  add column if not exists "rightsStatus" text;

do $$ begin
  alter table "MediaAsset" add constraint "MediaAsset_shootBatchId_fkey"
    foreign key ("shootBatchId") references "VideoShootBatch"("id") on delete set null on update cascade;
exception when duplicate_object then null;
end $$;

create index if not exists "MediaAsset_brandId_shootBatchId_idx" on "MediaAsset"("brandId", "shootBatchId");
create index if not exists "MediaAsset_videoProjectId_idx" on "MediaAsset"("videoProjectId");

insert into "BrandFolder" ("id", "brandId", "name", "createdAt", "updatedAt")
select 'video_originals_' || md5(brand."id"), brand."id", '视频原片', current_timestamp, current_timestamp
from "Brand" as brand
on conflict ("brandId", "name") do nothing;
