import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────
// Database 타입 정의 (supabase gen types 대체)
// ──────────────────────────────────────────────

export interface Document {
  id: string
  content: string
  metadata: Record<string, unknown> | null
  embedding: number[] | null
  created_at: string
}

export interface Correction {
  id: string
  original_chunk_id: string | null
  original_content: string | null
  correction_text: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  reembedded_at: string | null
  created_at: string
}

export interface MatchDocumentResult {
  id: string
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
}

export interface MatchDocumentWithCorrectionsResult {
  id: string
  content: string
  metadata: Record<string, unknown> | null
  similarity: number
  is_corrected: boolean
}

/** Supabase Database 스키마 타입 — supabase gen types 전까지 수동 관리 */
export interface Database {
  public: {
    Tables: {
      documents: {
        Row: Document
        Insert: Omit<Document, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<Document, 'id'>>
        Relationships: []
      }
      corrections: {
        Row: Correction
        Insert: {
          id?: string
          original_chunk_id?: string | null
          original_content?: string | null
          correction_text: string
          reason?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          reembedded_at?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Correction, 'id'>>
        Relationships: [
          {
            foreignKeyName: 'corrections_original_chunk_id_fkey'
            columns: ['original_chunk_id']
            isOneToOne: false
            referencedRelation: 'documents'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      match_documents: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
        }
        Returns: MatchDocumentResult[]
      }
      match_documents_with_corrections: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
        }
        Returns: MatchDocumentWithCorrectionsResult[]
      }
    }
    Enums: Record<string, never>
  }
}

// ──────────────────────────────────────────────
// 환경변수 검증
// ──────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * 클라이언트 사이드용 Supabase 클라이언트
 * - anon key 사용 (RLS 적용)
 * - 브라우저 및 서버 컴포넌트에서 공개 데이터 접근 시 사용
 */
export function createBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.'
    )
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey)
}

/**
 * 서버 사이드용 Supabase 클라이언트 (싱글턴)
 * - service role key 사용 (RLS 우회)
 * - API Route, Server Action 등 서버 전용 코드에서만 사용
 * - 절대 클라이언트에 노출하지 않을 것
 * - Edge Runtime에서는 함수 인스턴스가 재사용되므로 모듈 레벨 캐싱이 유효
 */
let _serverClient: SupabaseClient<Database> | null = null

export function createServerClient() {
  if (_serverClient) return _serverClient

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.'
    )
  }
  _serverClient = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return _serverClient
}
