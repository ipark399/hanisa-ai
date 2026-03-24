import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'edge';

/** POST request body */
interface CorrectionPostBody {
  original_chunk_id?: string;
  original_content?: string;
  correction_text?: string;
  reason?: string;
}

/**
 * POST /api/corrections
 * 전문가 교정 요청을 corrections 테이블에 저장
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CorrectionPostBody;
    const { original_chunk_id, original_content, correction_text, reason } =
      body;

    // 유효성 검증: correction_text 필수
    if (!correction_text || correction_text.trim().length === 0) {
      return NextResponse.json(
        { error: '수정 내용을 입력해주세요' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB 스키마 타입 미생성 상태에서 insert 호출
    const { data, error } = await (supabase.from('corrections') as any)
      .insert({
        correction_text: correction_text.trim(),
        original_chunk_id: original_chunk_id ?? null,
        original_content: original_content ?? null,
        reason: reason ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[corrections/POST] Supabase error:', error);
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('[corrections/POST] Unexpected error:', err);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/corrections
 * 교정 목록 조회 (관리용)
 * Query params: status (pending/approved/rejected), limit (default 20)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1),
      100
    );

    const supabase = createServerClient();

    let query = supabase
      .from('corrections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[corrections/GET] Supabase error:', error);
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다' },
        { status: 500 }
      );
    }

    return NextResponse.json({ corrections: data });
  } catch (err) {
    console.error('[corrections/GET] Unexpected error:', err);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    );
  }
}
