import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = 'dsh-dragview'
const project = resolve(fileURLToPath(new URL('..', import.meta.url)))
const scratch = mkdtempSync(join(tmpdir(), 'dsh-dragview-package-smoke-'))
const npmExecPath = process.env.npm_execpath

assert.ok(npmExecPath, 'run this smoke test through an npm script so npm_execpath is available')

function runNpm(args, cwd) {
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
    shell: false,
  })
  assert.equal(
    result.status,
    0,
    `npm ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  )
  return result.stdout
}

try {
  const packDirectory = join(scratch, 'pack')
  mkdirSync(packDirectory)
  const packOutput = runNpm(['pack', '--json', '--pack-destination', packDirectory], project)
  const [packResult] = JSON.parse(packOutput)
  assert.equal(packResult.name, PACKAGE_NAME)
  assert.equal(packResult.version, '0.1.0')

  const packedPaths = new Set(packResult.files.map(({ path }) => path.replaceAll('\\', '/')))
  for (const required of [
    'package.json',
    'cordis.patch.yml',
    'README.md',
    'CHANGELOG.md',
    'SECURITY.md',
    'LICENSE',
    'NOTICE',
    'src/index.js',
    'src/client.js',
  ]) {
    assert.ok(packedPaths.has(required), `tarball is missing ${required}`)
  }
  assert.ok(
    [...packedPaths].every((path) => !/(^|\/)(?:\.git|node_modules|\.env)(?:\/|$)|\.tgz$/i.test(path)),
    'tarball contains a repository, dependency, secret, or nested archive path',
  )

  const tarball = join(packDirectory, packResult.filename)
  assert.ok(existsSync(tarball), 'npm pack did not create the reported tarball')

  const consumer = join(scratch, 'consumer')
  runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--prefix', consumer, tarball],
    scratch,
  )

  const installedRoot = join(consumer, 'node_modules', PACKAGE_NAME)
  const manifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.name, PACKAGE_NAME)
  assert.equal(manifest.version, '0.1.0')
  assert.deepEqual(manifest.exports, {
    '.': './src/index.js',
    './client': './src/client.js',
    './cordis.patch.yml': './cordis.patch.yml',
    './package.json': './package.json',
  })
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh?.client?.platform, 'web')

  const requireFromConsumer = createRequire(join(consumer, 'package-smoke.cjs'))
  assert.equal(requireFromConsumer.resolve(PACKAGE_NAME), join(installedRoot, 'src', 'index.js'))
  assert.equal(requireFromConsumer.resolve(`${PACKAGE_NAME}/client`), join(installedRoot, 'src', 'client.js'))
  assert.equal(requireFromConsumer.resolve(`${PACKAGE_NAME}/cordis.patch.yml`), join(installedRoot, 'cordis.patch.yml'))

  const patch = readFileSync(join(installedRoot, manifest.dsh.bundle.patch), 'utf8')
  assert.match(patch, /id:\s*drag-file/)
  assert.match(patch, /name:\s*dsh-dragview/)

  const client = readFileSync(join(installedRoot, 'src', 'client.js'), 'utf8')
  assert.match(client, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(client, /id:\s*["']dsh-dragview["']/)

  console.log(`package smoke passed: ${packResult.filename} (${packResult.size} bytes, ${packResult.files.length} files)`)
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
