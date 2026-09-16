import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`
CREATE TABLE "User" (id text PRIMARY KEY, email text, type text, "authVersion" int DEFAULT 1);
CREATE TABLE "UserBusinessRole" (id text, "userId" text, role text);
CREATE TABLE "CrewMember" (id text, "userId" text, role text, "updatedAt" timestamp);
CREATE TABLE "SystemConfig" (id text, "immediErpEmployeeMap" jsonb, "immediErpCostCenter" text, "updatedAt" timestamp);
CREATE TABLE "AuditLog" (id text, "actorType" text, "actorName" text, action text, "resourceId" text, "resourceType" text, "oldValue" jsonb, "newValue" jsonb, reason text);
INSERT INTO "User"(id,email,type) VALUES ('cmt19jo0u42u6rr29comy3xg5','hanfengze83@gmail.com','HUMAN'),('cmrsz84qu009foe2a8xsmimo7','luoyueling@12eat.ai','HUMAN'),('liwei','liwei@deliverychinatown.com','HUMAN');
INSERT INTO "UserBusinessRole" VALUES ('r1','cmt19jo0u42u6rr29comy3xg5','AMC_PRINCIPAL'),('r2','cmrsz84qu009foe2a8xsmimo7','AMC_PRINCIPAL'),('r3','liwei','AMC_PRINCIPAL'),('r4','liwei','BRAND_OWNER');
INSERT INTO "CrewMember" VALUES ('c1','liwei','PRINCIPAL',now());
INSERT INTO "SystemConfig" (id) VALUES ('default');
`)
await db.exec(fs.readFileSync('prisma/migrations/20260916210000_approved_brand_principals/migration.sql','utf8'))
assert.equal((await db.query(`SELECT * FROM "UserBusinessRole" WHERE role='AMC_PRINCIPAL'`)).rows.length, 2)
assert.equal((await db.query(`SELECT role FROM "CrewMember" WHERE id='c1'`)).rows[0].role, 'EDITOR')
assert.equal((await db.query(`SELECT * FROM "UserBusinessRole" WHERE "userId"='liwei' AND role='BRAND_OWNER'`)).rows.length, 1)
assert.equal((await db.query(`SELECT "authVersion" FROM "User" WHERE id='liwei'`)).rows[0].authVersion, 2)
const audit=(await db.query(`SELECT "oldValue" FROM "AuditLog"`)).rows[0].oldValue
assert.equal(audit.businessRoles.length, 3); assert.equal(audit.crewMemberships.length,1)
console.log('Approved roster migration preserves other roles, collaboration and before-state audit; obsolete sessions invalidated')
await db.close()
