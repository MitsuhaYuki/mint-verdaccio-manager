/**
 * 准备 Verdaccio 运行时资源
 * 1. 下载 Node.js 便携版作为 sidecar
 * 2. 复制 Verdaccio 及其依赖到资源目录
 */

import { createWriteStream, existsSync, mkdirSync, rmSync, cpSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')
const tauriDir = join(projectRoot, 'src-tauri')
const binariesDir = join(tauriDir, 'binaries')
const resourcesDir = join(tauriDir, 'resources')

const NODE_VERSION = '22.16.0'

function getRustTarget() {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32') {
    return arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'i686-pc-windows-msvc'
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  }
  if (platform === 'linux') {
    return arch === 'x64' ? 'x86_64-unknown-linux-gnu' : 'i686-unknown-linux-gnu'
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

function getNodeDownloadUrl() {
  const platform = process.platform
  const arch = process.arch
  let os = ''
  let nodeArch = ''
  let ext = ''

  if (platform === 'win32') {
    os = 'win'
    ext = 'zip'
  } else if (platform === 'darwin') {
    os = 'darwin'
    ext = 'tar.gz'
  } else if (platform === 'linux') {
    os = 'linux'
    ext = 'tar.gz'
  } else {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  if (arch === 'x64') {
    nodeArch = 'x64'
  } else if (arch === 'arm64') {
    nodeArch = 'arm64'
  } else {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  const filename = `node-v${NODE_VERSION}-${os}-${nodeArch}`
  return {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/${filename}.${ext}`,
    filename,
    ext
  }
}

async function downloadFile(url, destPath) {
  console.log(`📥 Downloading: ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
  }
  const fileStream = createWriteStream(destPath)
  await pipeline(response.body, fileStream)
  console.log(`✅ Downloaded to: ${destPath}`)
}

function extractZip(zipPath, destDir) {
  console.log(`📦 Extracting ZIP: ${zipPath}`)
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
    stdio: 'inherit'
  })
}

async function main() {
  console.log('🚀 Preparing Verdaccio runtime resources...\n')

  const rustTarget = getRustTarget()
  const ext = process.platform === 'win32' ? '.exe' : ''

  if (!existsSync(binariesDir)) {
    mkdirSync(binariesDir, { recursive: true })
  }
  if (!existsSync(resourcesDir)) {
    mkdirSync(resourcesDir, { recursive: true })
  }

  // Step 1: Prepare Node.js sidecar
  console.log('=== Step 1: Preparing Node.js sidecar ===\n')

  const nodeOutputPath = join(binariesDir, `node-${rustTarget}${ext}`)
  
  if (existsSync(nodeOutputPath)) {
    console.log(`✅ Node.js sidecar already exists: ${nodeOutputPath}`)
  } else {
    const { url, filename, ext: archiveExt } = getNodeDownloadUrl()
    const tempDir = join(projectRoot, '.node-temp')
    const archivePath = join(tempDir, `node.${archiveExt}`)

    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    await downloadFile(url, archivePath)

    if (archiveExt === 'zip') {
      extractZip(archivePath, tempDir)
    }

    const nodeExePath = join(tempDir, filename, `node${ext}`)
    if (!existsSync(nodeExePath)) {
      throw new Error(`Node executable not found: ${nodeExePath}`)
    }

    cpSync(nodeExePath, nodeOutputPath)
    
    if (process.platform !== 'win32') {
      chmodSync(nodeOutputPath, 0o755)
    }

    console.log(`✅ Node.js sidecar prepared: ${nodeOutputPath}`)
    rmSync(tempDir, { recursive: true, force: true })
    console.log('🧹 Cleaned up temp files')
  }

  // Step 2: Copy Verdaccio to resources
  console.log('\n=== Step 2: Copying Verdaccio to resources ===\n')

  const allNodeModules = join(projectRoot, 'node_modules')
  const destNodeModules = join(resourcesDir, 'node_modules')

  if (!existsSync(join(allNodeModules, 'verdaccio'))) {
    console.error('❌ Verdaccio not found. Please run "pnpm install" first.')
    process.exit(1)
  }

  if (existsSync(destNodeModules)) {
    console.log('🧹 Cleaning old resources...')
    rmSync(destNodeModules, { recursive: true, force: true })
  }

  console.log(`📁 Copying node_modules (this may take a while)...`)
  
  const excludePatterns = [
    '.bin',
    '.cache',
    '.pnpm',
    '.vite',
    '.vite-temp',
    '@ant-design',
    '@biomejs',
    '@tailwindcss',
    '@tauri-apps',
    '@types',
    '@vitejs',
    'ahooks',
    'antd',
    'react',
    'react-dom',
    'tailwindcss',
    'esbuild',
    'rollup',
    'typescript',
    'vite',
  ]
  
  cpSync(allNodeModules, destNodeModules, { 
    recursive: true,
    filter: (src) => {
      for (const pattern of excludePatterns) {
        if (src.includes(pattern)) {
          return false
        }
      }
      return true
    }
  })

  console.log(`\n✅ Resources prepared in: ${resourcesDir}`)
  console.log('\n🎉 All done!')
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
