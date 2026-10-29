import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const code = ts.transpileModule(readFileSync('src/lib/email.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
async function fixture(host = 'smtp.gmail.com', failure?: any) {
  let transport: any, message: any, lookups = 0
  const modules: any = {
    nodemailer: { default: { createTransport: (options: any) => { transport = options; return { sendMail: async (mail: any) => { message = mail; if (failure) throw failure; return { accepted: ['fixture@example.com'], messageId: mail.messageId } } } } } },
    'node:dns/promises': { lookup: async (hostname: string, options: any) => { lookups++; assert.equal(hostname, 'smtp.gmail.com'); assert.equal(options.family, 4); return { address: '192.0.2.1' } } },
    './prisma': { prisma: { systemConfig: { findUnique: async () => ({ smtpHost: host, smtpPort: 465, smtpSecure: true, smtpFrom: 'fixture@example.com', smtpUser: 'fixture@example.com', smtpPassword: 'test-only' }) } } },
    './subscription/terms': {},
  }
  const exports: any = {}
  vm.runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name] }, console: { log() {}, warn() {}, error() {} } })
  const result = await exports.sendEmail({ to: 'fixture@example.com', subject: 'Fixture', html: 'Fixture', messageId: '<fixture@example.com>', attachments: [{ content: Buffer.from('pdf') }] })
  return { result, transport, message, lookups }
}
test('Gmail uses resolved IPv4 with TLS identity and preserves deterministic mail receipt', async () => {
  const f = await fixture()
  assert.equal(f.transport.host, '192.0.2.1'); assert.equal(f.transport.tls.servername, 'smtp.gmail.com')
  assert.equal(f.transport.secure, true); assert.notEqual(f.transport.tls.rejectUnauthorized, false)
  assert.equal(f.result.success, true); assert.equal(f.result.messageId, '<fixture@example.com>')
  assert.equal(f.message.attachments[0].content.toString(), 'pdf')
})
test('custom SMTP configuration remains unchanged; connection failures remain safely retryable', async () => {
  const custom = await fixture('smtp.example.com')
  assert.equal(custom.lookups, 0); assert.equal(custom.transport.host, 'smtp.example.com')
  const failed = await fixture('smtp.gmail.com', { code: 'ETIMEDOUT', command: 'CONN' })
  assert.equal(failed.result.deliveryState, 'NOT_SENT')
  const unknown = await fixture('smtp.gmail.com', { code: 'ETIMEDOUT', command: 'DATA' })
  assert.equal(unknown.result.deliveryState, 'UNKNOWN')
})
