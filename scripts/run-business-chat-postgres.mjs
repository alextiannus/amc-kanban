import { execFileSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { userInfo } from 'node:os'

const probe = createServer()
await new Promise((resolve, reject) => {
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', resolve)
})
const port = probe.address().port
await new Promise((resolve) => probe.close(resolve))

const directory = await mkdtemp('/private/tmp/amc-business-chat-pg-')
const postgresBin = '/opt/homebrew/opt/postgresql@18/bin/'
const run = (name, args) =>
  execFileSync(postgresBin + name, args, { stdio: 'pipe', timeout: 60_000 })

run('initdb', ['-D', directory, '-A', 'trust', '--no-locale', '-E', 'UTF8'])
let started = false
try {
  run('pg_ctl', [
    '-D', directory,
    '-l', directory + '/server.log',
    '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`,
    '-w', 'start',
  ])
  started = true
  run('createdb', [
    '-h', '127.0.0.1',
    '-p', String(port),
    'amc_lineage_test_business_chat',
  ])
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://${userInfo().username}@127.0.0.1:${port}/amc_lineage_test_business_chat`,
  }
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'],
    { stdio: 'inherit', timeout: 60_000, env },
  )
  execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/test-business-chat.mts'],
    { stdio: 'inherit', timeout: 60_000, env },
  )
} finally {
  if (started) {
    run('pg_ctl', ['-D', directory, '-m', 'immediate', '-w', 'stop'])
  }
}
