import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { retrieveContext } from '@/lib/rag';
import { buildSystemPrompt } from '@/lib/prompts';

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
  });

  const tStream = Date.now();
  console.log(
    `[perf] parse=${tRag - t0}ms (RAG+convert parallel) | streamInit=${tStream - tRag}ms | total-to-stream=${tStream - t0}ms | contexts=${contexts.length}`
  );

  return result.toUIMessageStreamResponse();
}
