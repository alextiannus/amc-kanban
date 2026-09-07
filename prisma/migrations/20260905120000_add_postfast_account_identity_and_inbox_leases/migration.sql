alter table "SocialAccount"
  add column if not exists "postfastAccountId" text;

create unique index if not exists "SocialAccount_brandId_postfastAccountId_key"
  on "SocialAccount" ("brandId", "postfastAccountId");

alter table "IdempotencyRecord"
  add column if not exists "updatedAt" timestamp(3) not null default current_timestamp;