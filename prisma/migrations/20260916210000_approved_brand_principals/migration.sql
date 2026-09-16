BEGIN;
-- User-approved company roster, verified against AMC and ERP identities.
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM "User" WHERE "type" = 'HUMAN' AND
    (("id" = 'cmt19jo0u42u6rr29comy3xg5' AND "email" = 'hanfengze83@gmail.com') OR
     ("id" = 'cmrsz84qu009foe2a8xsmimo7' AND "email" = 'luoyueling@12eat.ai'))) <> 2 THEN
    RAISE EXCEPTION 'Approved AMC principals were not found with their verified identities';
  END IF;
END $$;

INSERT INTO "AuditLog" ("id", "actorType", "actorName", "action", "resourceId", "resourceType", "oldValue", "newValue", "reason")
SELECT 'immedi-principal-roster-20260916', 'SYSTEM', 'User-approved ERP integration migration',
  'APPROVED_PRINCIPAL_ROSTER_UPDATED', 'company-principals', 'UserBusinessRole',
  jsonb_build_object('businessRoles', (SELECT jsonb_agg(to_jsonb(r)) FROM "UserBusinessRole" r WHERE r."role" = 'AMC_PRINCIPAL'),
    'crewMemberships', (SELECT jsonb_agg(to_jsonb(c)) FROM "CrewMember" c JOIN "User" u ON u."id" = c."userId" WHERE c."role" = 'PRINCIPAL' AND u."type" = 'HUMAN')),
  '{"principals":["hanfengze83@gmail.com","luoyueling@12eat.ai"],"liWeiTitle":"私域运营官"}'::jsonb,
  'User requested Li Wei move to private-domain operations and only Xiao Han/Luo Yueling remain brand principals';

UPDATE "User" u SET "authVersion" = "authVersion" + 1
WHERE u."type" = 'HUMAN' AND u."id" NOT IN ('cmt19jo0u42u6rr29comy3xg5', 'cmrsz84qu009foe2a8xsmimo7')
AND EXISTS (SELECT 1 FROM "UserBusinessRole" r WHERE r."userId" = u."id" AND r."role" = 'AMC_PRINCIPAL');

DELETE FROM "UserBusinessRole" r USING "User" u
WHERE r."userId" = u."id" AND u."type" = 'HUMAN' AND r."role" = 'AMC_PRINCIPAL'
AND u."id" NOT IN ('cmt19jo0u42u6rr29comy3xg5', 'cmrsz84qu009foe2a8xsmimo7');

-- Keep existing collaboration access but remove the principal attribution.
UPDATE "CrewMember" c SET "role" = 'EDITOR', "updatedAt" = CURRENT_TIMESTAMP
FROM "User" u WHERE u."id" = c."userId" AND u."type" = 'HUMAN' AND c."role" = 'PRINCIPAL'
AND u."id" NOT IN ('cmt19jo0u42u6rr29comy3xg5', 'cmrsz84qu009foe2a8xsmimo7');

UPDATE "SystemConfig" SET "immediErpEmployeeMap" = '{"cmt19jo0u42u6rr29comy3xg5":"ou_3669d7824889adf930e7ea51d6b8d1f3","hanfengze83@gmail.com":"ou_3669d7824889adf930e7ea51d6b8d1f3","cmrsz84qu009foe2a8xsmimo7":"ou_28b0a57e19c01bb48e4cbcd2ed6a33ad","luoyueling@12eat.ai":"ou_28b0a57e19c01bb48e4cbcd2ed6a33ad"}'::jsonb,
 "immediErpCostCenter" = COALESCE("immediErpCostCenter", 'Main - IMD'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default';

COMMIT;
