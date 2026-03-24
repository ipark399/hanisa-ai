import { streamText, convertToModelMessages, tool, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { retrieveContext } from '@/lib/rag';
import { buildSystemPrompt } from '@/lib/prompts';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function POST(req: Request) {
  const t0 = Date.now();

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  // 마지막 사용자 메시지에서 텍스트 추출
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user');

  const query =
    lastUserMessage?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ') ?? '';

  // RAG 검색과 메시지 변환을 병렬 실행 (불필요한 직렬 await 제거)
  const [contexts, modelMessages] = await Promise.all([
    query.length > 0 ? retrieveContext(query) : Promise.resolve([]),
    convertToModelMessages(messages),
  ]);

  const tRag = Date.now();

  // 동적 시스템 프롬프트 생성
  const systemPrompt = buildSystemPrompt(contexts);

  const result = streamText({
    model: google('gemini-2.5-pro'),
    system: systemPrompt,
    messages: modelMessages,
    tools: {
      submitCorrection: tool({
        description: '사용자가 한의학 정보의 오류를 지적하거나 수정을 요청할 때 호출합니다. 예: "갈근탕 설명이 틀렸어", "이 처방의 구성 약재가 잘못됐어", "~로 수정해줘"',
        parameters: z.object({
          original_content: z.string().describe('수정 대상 원래 내용'),
          correction_text: z.string().describe('올바른 내용 (수정된 정보)'),
          reason: z.string().describe('수정 사유'),
        }),
        execute: async ({ original_content, correction_text, reason }) => {
          const supabase = createServerClient();
          const { data, error } = await (supabase.from('corrections') as any)
            .insert({
              correction_text: correction_text.trim(),
              original_content: original_content.trim(),
              reason: reason.trim(),
              original_chunk_id: null,
              status: 'approved',
            })
            .select('id')
            .single();

          if (error) {
            return { success: false, message: '수정 요청 저장에 실패했습니다.' };
          }
          return { success: true, id: data.id, message: '수정 요청이 접수되었습니다. 검토 후 반영됩니다.' };
        },
      }),
    },
    maxSteps: 2,
  });

  const tStream = Date.now();
  console.log(
    `[perf] parse=${tRag - t0}ms (RAG+convert parallel) | streamInit=${tStream - tRag}ms | total-to-stream=${tStream - t0}ms | contexts=${contexts.length}`
  );

  return result.toUIMessageStreamResponse();
}
