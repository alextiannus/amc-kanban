BEGIN;
-- Preflight before mutation: do not silently discard unknown historical roles.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "UserBusinessRole" WHERE role NOT IN ('ADMIN','AMC_PRINCIPAL','BRAND_OWNER','BD','RESEARCHER')) OR EXISTS (SELECT 1 FROM "RolePermissionPolicy" WHERE role NOT IN ('AMC_PRINCIPAL','BRAND_OWNER','BD','RESEARCHER')) THEN
  RAISE EXCEPTION 'Unregistered historical role found; review role data before migration';
 END IF;
END $$;
CREATE TABLE "RoleDefinition" (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, "normalizedName" TEXT NOT NULL UNIQUE,
 description TEXT NOT NULL DEFAULT '', "builtIn" BOOLEAN NOT NULL DEFAULT false,
 enabled BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "RoleDefinition" (id,name,"normalizedName","builtIn") VALUES
 ('ADMIN','管理员','管理员',true), ('AMC_PRINCIPAL','主理人','主理人',true),
 ('BRAND_OWNER','品牌主','品牌主',true), ('BD','BD','bd',true), ('RESEARCHER','研究员','研究员',true);
ALTER TABLE "UserBusinessRole" ADD CONSTRAINT "UserBusinessRole_role_fkey" FOREIGN KEY (role) REFERENCES "RoleDefinition"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RolePermissionPolicy" ADD CONSTRAINT "RolePermissionPolicy_role_fkey" FOREIGN KEY (role) REFERENCES "RoleDefinition"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
