import { existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

  const target = resolvePath(projectRoot, 'src', specifier.slice(2))
  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    `${target}.mjs`,
    resolvePath(target, 'index.ts'),
    resolvePath(target, 'index.tsx'),
  ]
  const match = candidates.find((candidate) => existsSync(candidate))
  if (!match) return nextResolve(specifier, context)
  return nextResolve(pathToFileURL(match).href, context)
}
