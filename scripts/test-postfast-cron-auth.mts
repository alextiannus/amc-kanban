import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import Module, { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  loader = Module as any,
  resolve = loader._resolveFilename;
loader._resolveFilename = function (name: string, ...args: any[]) {
  return name === "server-only"
    ? require.resolve("next/dist/compiled/server-only/empty.js")
    : resolve.call(this, name, ...args);
};
const { POST } = await import("../src/app/api/cron/postfast-sync-all/route.ts");
loader._resolveFilename = resolve;
const previous = process.env.CRON_SECRET;
try {
  delete process.env.CRON_SECRET;
  assert.equal(
    (
      await POST(
        new NextRequest("https://fixture.invalid/api/cron/postfast-sync-all", {
          method: "POST",
        }),
      )
    ).status,
    401,
  );
  process.env.CRON_SECRET = "local-auth-fixture";
  assert.equal(
    (
      await POST(
        new NextRequest("https://fixture.invalid/api/cron/postfast-sync-all", {
          method: "POST",
          headers: { "x-cron-secret": "wrong" },
        }),
      )
    ).status,
    401,
  );
  console.log(
    "PASS actual cron handler rejects missing configuration and invalid credentials before DB/queue/network effects",
  );
} finally {
  if (previous === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous;
}
