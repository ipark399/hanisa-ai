## Last Session: 2026-03-24

**Completed**:
- 한의사AI 프로젝트 생성 (Discovery → 요구사항서 → PM 핸드오프 → P1~P5 전체 완료)
- 기술 스택: Next.js 15 + Vercel AI SDK + Gemini 2.5 Pro + Supabase pgvector
- 데이터 파이프라인 실행: 한의학 데이터 81건 수집 → 청킹 → 임베딩 → Supabase 적재
- 임베딩 모델 변경: text-embedding-004 → gemini-embedding-001 (3072차원)
- Gemini 모델명 수정: gemini-2.5-pro-preview-05-06 → gemini-2.5-pro
- GitHub 리포 생성 (ipark399/hanisa-ai) + Vercel 배포 (hanisa-ai.vercel.app)
- 면책 문구 수정: "최종 판단은 한의사의 책임" → "참고로만 사용 부탁드립니다"
- 채팅 기반 정보 수정 요청 기능 추가 (Function Calling + 자동 승인)
- CLAUDE.md, docs/architecture/structure.md 생성
- 인프라 문서 업데이트 (vercel.md 분리, supabase.md에 한의사AI 추가)

**In Progress**:
- 없음

**Blockers**:
- Supabase Free 플랜 벡터 인덱스 2000차원 제한 → 현재 인덱스 없이 exact search (81건이라 무방)
- Supabase 서울 리전 IPv6 전용 → psql/CLI 직접 연결 불가 (SQL Editor로 우회)

**Next Steps**:
- 한의학 데이터 확장 (논문, 추가 경전, 변증 체계 등)
- 사용자 피드백 기반 UX 개선
- 데이터 수만 건 이상 시 벡터 인덱스 도입 (Supabase Pro 전환 또는 차원 축소)
- 커스텀 도메인 연결

**Lessons → Rules**:
- 임베딩 모델 변경 시 DB 벡터 차원 + 인덱스 + RPC 함수 모두 변경 필요 → CLAUDE.md Rules에 반영 완료
- Supabase Free IPv6 전용 → SQL Editor로 마이그레이션 실행 필요 (psql 불가)
