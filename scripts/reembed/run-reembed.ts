/**
 * 재임베딩 실행 엔트리포인트
 *
 * 사용법:
 *   npx tsx scripts/reembed/run-reembed.ts           # 실행
 *   npx tsx scripts/reembed/run-reembed.ts --dry-run  # 대상만 출력
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── .env.local 로드 (기존 run-embed.ts 패턴 재사용) ───

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.substring(0, eqIdx).trim()
    let value = trimmed.substring(eqIdx + 1).trim()
    // 따옴표 제거
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'))

import { reembedCorrections } from './reembed-corrections'

// ─── 환경변수 검증 ───

function validateEnv(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.error('❌ 필수 환경변수가 설정되지 않았습니다:')
    for (const key of missing) {
      console.error(`   - ${key}`)
    }
    console.error('\n.env.local 파일 또는 환경변수를 확인하세요.')
    process.exit(1)
  }
}

// ─── CLI 파싱 ───

function parseCLI(): { dryRun: boolean } {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  if (args.some((a) => a !== '--dry-run')) {
    const unknown = args.filter((a) => a !== '--dry-run')
    console.warn(`⚠ 알 수 없는 옵션 무시: ${unknown.join(', ')}`)
  }

  return { dryRun }
}

// ─── 메인 ───

async function main(): Promise<void> {
  console.log('═'.repeat(60))
  console.log('🔄 한의사 AI — 교정 재임베딩 스크립트')
  console.log('═'.repeat(60))

  validateEnv()

  const { dryRun } = parseCLI()

  if (dryRun) {
    console.log('🔍 DRY-RUN 모드: 실제 업데이트를 수행하지 않습니다.\n')
  }

  const startTime = Date.now()

  try {
    const result = await reembedCorrections({ dryRun })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n⏱ 소요 시간: ${elapsed}초`)

    if (result.failed > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error(
      '\n💥 치명적 오류:',
      error instanceof Error ? error.message : String(error),
    )
    process.exit(2)
  }
}

main()
