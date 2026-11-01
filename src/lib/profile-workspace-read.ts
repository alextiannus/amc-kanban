import {Prisma} from '@prisma/client'
import {prisma} from './prisma'
// Keep missing keys distinct from explicit null so legacy overlay behavior is unchanged.
const projection=(column:Prisma.Sql)=>Prisma.sql`COALESCE((SELECT jsonb_object_agg(key,
 CASE WHEN key='coCreation' AND jsonb_typeof(value)='object' THEN
  (SELECT jsonb_object_agg(section.key,CASE WHEN jsonb_typeof(section.value)='object' THEN
    (SELECT jsonb_object_agg(field.key,field.value) FROM jsonb_each(section.value) field WHERE field.key IN ('content','updatedAt','attachmentIds'))
    ELSE section.value END) FROM jsonb_each(value) section WHERE section.key IN ('brand_information','interview','marketing_plan'))
 WHEN key='marketingPlan' AND jsonb_typeof(value->'content')='string' AND btrim(value->>'content')<>'' THEN
  jsonb_build_object('content',value->'content','planningStartMonth',value->'planningStartMonth')
 ELSE value END)
 FROM jsonb_each(CASE WHEN jsonb_typeof(${column})='object' THEN ${column} ELSE '{}'::jsonb END)
 WHERE key IN ('coCreation','marketingPlan')), '{}'::jsonb)`
/** Project inside PostgreSQL: never transport workspace history for a Profile read. */
export async function readProfileWorkspace(brandId:string){
 const rows=await prisma.$queryRaw<Array<{marketingSolution:any;brandPlan:any}>>`
 SELECT ${projection(Prisma.sql`"marketingSolution"`)} AS "marketingSolution",
 ${projection(Prisma.sql`"brandPlan"`)} AS "brandPlan"
 FROM "BrandKnowledge" WHERE "brandId"=${brandId}`
 return rows[0]||{marketingSolution:null,brandPlan:null}
}
