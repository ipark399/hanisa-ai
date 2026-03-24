/**
 * 청킹 모듈 테스트 스크립트
 *
 * 실행: npx tsx scripts/chunking/test-chunker.ts
 *
 * 3종 데이터(경전/약재/처방)에 대해 실제 데이터와 유사한
 * 샘플을 사용하여 청킹 로직을 검증합니다.
 */

import {
  chunkClassicText,
  chunkHerb,
  chunkPrescription,
  estimateTokenCount,
  validateChunks,
  formatValidationReport,
} from './chunker';
import type {
  ClassicTextMetadata,
  HerbData,
  PrescriptionData,
} from './types';

// ─── 테스트 결과 추적 ───

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

// ─── 테스트 1: 토큰 카운트 ───

function testTokenCount(): void {
  console.log('\n=== 테스트 1: 토큰 카운트 ===');

  // 한글 텍스트
  const korean = '대보원기하고 맥을 회복시키며 비장을 보하고 폐를 이롭게 한다';
  const koreanTokens = estimateTokenCount(korean);
  assert(koreanTokens > 0, `한글 토큰 수 계산: ${koreanTokens}`);

  // 한자 텍스트
  const hanja = '大補元氣 復脈固脫 補脾益肺 生津養血 安神益智';
  const hanjaTokens = estimateTokenCount(hanja);
  assert(hanjaTokens > 0, `한자 토큰 수 계산: ${hanjaTokens}`);

  // 혼합 텍스트
  const mixed = '인삼(人蔘)은 대보원기(大補元氣)하는 약재이다.';
  const mixedTokens = estimateTokenCount(mixed);
  assert(mixedTokens > 0, `혼합 토큰 수 계산: ${mixedTokens}`);

  // 빈 문자열
  const emptyTokens = estimateTokenCount('');
  assert(emptyTokens === 0, `빈 문자열 토큰 수: ${emptyTokens}`);

  // ASCII
  const ascii = 'Astragali Radix is a medicinal herb.';
  const asciiTokens = estimateTokenCount(ascii);
  assert(asciiTokens > 0, `ASCII 토큰 수 계산: ${asciiTokens}`);
}

// ─── 테스트 2: 경전 텍스트 청킹 ───

function testClassicTextChunking(): void {
  console.log('\n=== 테스트 2: 경전 텍스트 청킹 ===');

  // 동의보감 내경편 스타일 샘플 텍스트
  const sampleText = `天地之間 萬物之中 惟人最貴
하늘과 땅 사이 만물 가운데 오직 사람이 가장 귀하다.
人之所以能生者 以其有五臟六腑也
사람이 살 수 있는 것은 오장육부가 있기 때문이다.

心者 君主之官也 神明出焉
심장은 군주의 관직과 같아 신명이 여기에서 나온다.
肺者 相傅之官也 治節出焉
폐는 재상의 관직과 같아 절도를 다스림이 여기에서 나온다.
肝者 將軍之官也 謀慮出焉
간은 장군의 관직과 같아 모략이 여기에서 나온다.

脾者 諫議之官也 知周出焉
비장은 간의(諫議)의 관직과 같아 두루 앎이 여기에서 나온다.
腎者 作强之官也 伎巧出焉
신장은 작강의 관직과 같아 기교가 여기에서 나온다.

五臟者 所以藏精神血氣魂魄者也
오장은 정신과 혈기와 혼백을 간직하는 곳이다.
六腑者 所以化水穀而行津液者也
육부는 수곡을 소화하고 진액을 운행하는 곳이다.
此皆人之所以能生者也
이것이 모두 사람이 살 수 있는 까닭이다.

養生之道 先須慮身 凡所動止 不可過度
양생의 도는 먼저 몸을 헤아려야 하니 모든 동작을 과하게 하지 말아야 한다.
能中和者 必久壽也
능히 중화를 이루는 사람은 반드시 오래 산다.
飲食有節 起居有常 不妄作勞
음식에 절도가 있고 기거에 일정함이 있으며 헛되이 수고하지 않으면
故能形與神俱 而盡終其天年 度百歲乃去
그러므로 형체와 정신이 함께하여 천수를 다하고 백 세에 이르러 세상을 떠난다.`;

  const metadata: ClassicTextMetadata = {
    book: '동의보감',
    volume: '내경편',
    chapter: '권1',
    section: '身形',
    subsection: '五臟六腑',
  };

  const chunks = chunkClassicText(sampleText, metadata);

  assert(chunks.length > 0, `경전 청크 생성: ${chunks.length}개`);
  assert(
    chunks.every((c) => c.metadata.category === '경전'),
    '모든 청크의 카테고리가 "경전"',
  );
  assert(
    chunks.every((c) => c.metadata.source === '동의보감'),
    '모든 청크의 출처가 "동의보감"',
  );
  assert(
    chunks.every((c) => c.content.includes('[동의보감]')),
    '모든 청크에 컨텍스트 prefix 포함',
  );
  assert(
    chunks.every((c) => c.id.length > 0),
    '모든 청크에 고유 ID 부여',
  );
  assert(
    chunks.every((c) => c.token_count > 0),
    '모든 청크에 토큰 수 계산됨',
  );

  // 토큰 상한 검증
  const validation = validateChunks(chunks);
  assert(
    validation.oversizedChunks.length === 0,
    `상한(512) 초과 청크 없음 (실제: ${validation.oversizedChunks.length}건)`,
  );

  console.log(`  [정보] 경전 청크 상세:`);
  for (const c of chunks) {
    console.log(`    ${c.id}: ${c.token_count}토큰 | ${c.content.substring(0, 60)}...`);
  }

  console.log(`\n${formatValidationReport(validation)}`);
}

// ─── 테스트 3: 약재 데이터 청킹 ───

function testHerbChunking(): void {
  console.log('\n=== 테스트 3: 약재 데이터 청킹 ===');

  // 일반 약재 (512 토큰 이하)
  const herb1: HerbData = {
    name: '인삼',
    name_hanja: '人蔘',
    latin_name: 'Ginseng Radix',
    properties: '甘微溫',
    meridians: '脾, 肺',
    efficacy_category: '補益藥 補氣藥',
    efficacy: '大補元氣, 復脈固脫, 補脾益肺, 生津養血, 安神益智',
    indications:
      '氣虛欲脫, 脈微欲絕, 脾氣不足, 肺氣虧虛, 津傷口渴, 心神不安, 失眠多夢',
    dosage: '한국 3~9g, 중국 3~9g',
    cautions:
      '실증(實證)이나 열증(熱證)에는 사용하지 않는다. 여로(藜蘆)와 상반(相反)한다.',
    source: 'OASIS 한약재백과',
    original_id: '1',
  };

  const chunks1 = chunkHerb(herb1, 1);
  assert(chunks1.length >= 1, `인삼 청크: ${chunks1.length}개`);
  assert(
    chunks1[0].content.includes('[약재] 인삼'),
    '약재 청크에 제목 포함',
  );
  assert(
    chunks1[0].content.includes('성미: 甘微溫'),
    '약재 청크에 성미 포함',
  );
  assert(
    chunks1[0].metadata.category === '약재',
    '카테고리가 "약재"',
  );
  assert(
    chunks1[0].metadata.title === '인삼 (人蔘)',
    `제목: ${chunks1[0].metadata.title}`,
  );

  const validation1 = validateChunks(chunks1, undefined, true);
  assert(
    validation1.oversizedChunks.length === 0,
    `인삼: 상한 초과 없음 (토큰: ${chunks1.map((c) => c.token_count).join(', ')})`,
  );

  // 긴 약재 데이터 (512 토큰 초과 시뮬레이션)
  const herb2: HerbData = {
    name: '황기',
    name_hanja: '黃芪',
    latin_name: 'Astragali Radix',
    properties: '甘微溫',
    meridians: '肺, 脾',
    efficacy_category: '補益藥 補氣藥',
    efficacy:
      '補氣升陽, 益衛固表, 托毒生肌, 利水退腫. 황기는 기를 보하고 양을 올리는 대표적인 약재로, 비폐양기허증에 널리 사용된다. 고인들은 황기를 보기약의 장(長)이라 하여, 기가 허하여 힘이 없고, 숨이 차며, 식욕이 없고, 대변이 묽을 때 두루 사용하였다.',
    indications:
      '기허증(氣虛證): 권태무력, 식욕부진, 대변당(大便溏), 자한(自汗). 표허자한(表虛自汗): 위기(衛氣)가 허약하여 땀이 저절로 나는 경우. 기허부종(氣虛浮腫): 비기허로 인한 부종, 소변불리. 기혈양허(氣血兩虛): 창양(瘡瘍)이 오래도록 아물지 않는 경우. 중기하함(中氣下陷): 탈항(脫肛), 자궁하수(子宮下垂), 위하수(胃下垂). 소갈증(消渴證): 기음양허(氣陰兩虛)로 인한 당뇨. 비약화(痹弱化): 근골이 약해지고 저리는 경우.',
    dosage: '한국 6~15g (대량 시 30g까지), 중국 9~30g',
    cautions:
      '표실사기(表實邪氣)가 있을 때, 즉 감기 초기에 오한발열이 있을 때는 사용하지 않는다. 음허양항(陰虛陽亢)으로 얼굴이 붉고 머리가 어지러운 경우에도 사용을 피한다. 습열(濕熱)이 왕성하여 소변이 황적색이고 복부가 팽만한 경우에도 부적합하다. 기체(氣滯)로 인한 흉복만(胸腹滿)에도 사용하지 않는다. 임산부는 대량 복용을 피한다.',
    source: 'OASIS 한약재백과',
    original_id: '2',
  };

  const chunks2 = chunkHerb(herb2, 2);
  assert(chunks2.length >= 1, `황기 청크: ${chunks2.length}개`);
  assert(
    chunks2.every((c) => c.content.includes('[약재] 황기')),
    '분할된 모든 청크에 헤더 포함',
  );

  const validation2 = validateChunks(chunks2, undefined, true);
  assert(
    validation2.oversizedChunks.length === 0,
    `황기: 상한 초과 없음 (청크별 토큰: ${chunks2.map((c) => c.token_count).join(', ')})`,
  );

  console.log(`  [정보] 약재 청크 상세:`);
  for (const c of [...chunks1, ...chunks2]) {
    console.log(`    ${c.id}: ${c.token_count}토큰 | ${c.content.substring(0, 60)}...`);
  }
}

// ─── 테스트 4: 처방 데이터 청킹 ───

function testPrescriptionChunking(): void {
  console.log('\n=== 테스트 4: 처방 데이터 청킹 ===');

  // 일반 처방
  const rx1: PrescriptionData = {
    name: '갈근탕',
    name_hanja: '葛根湯',
    name_english: 'Galgeun-tang',
    ingredients: [
      { herb: '갈근', dose: '8g' },
      { herb: '마황', dose: '4g' },
      { herb: '계지', dose: '3g' },
      { herb: '작약', dose: '3g' },
      { herb: '감초', dose: '2g' },
      { herb: '생강', dose: '3g' },
      { herb: '대추', dose: '4g' },
    ],
    efficacy: '發汗解表, 舒筋解肌',
    indications:
      '태양병(太陽病)으로 항강통(項强痛)이 있고 오한발열하며 땀이 나지 않는 경우. 감기, 인플루엔자 초기, 어깨결림, 두통.',
    source: 'OASIS 한약처방',
    historical_notes: '상한론(傷寒論), 동의보감(東醫寶鑑)',
    original_id: '1',
  };

  const chunks1 = chunkPrescription(rx1, 1);
  assert(chunks1.length >= 1, `갈근탕 청크: ${chunks1.length}개`);
  assert(
    chunks1[0].content.includes('[처방] 갈근탕'),
    '처방 청크에 제목 포함',
  );
  assert(
    chunks1[0].content.includes('구성:'),
    '처방 청크에 구성 약재 포함',
  );
  assert(
    chunks1[0].metadata.category === '처방',
    '카테고리가 "처방"',
  );

  // 긴 처방 (보중익기탕 + 상세 설명)
  const rx2: PrescriptionData = {
    name: '보중익기탕',
    name_hanja: '補中益氣湯',
    name_english: 'Bojungikgi-tang',
    ingredients: [
      { herb: '황기', dose: '15g' },
      { herb: '인삼', dose: '9g' },
      { herb: '백출', dose: '9g' },
      { herb: '감초', dose: '6g' },
      { herb: '당귀', dose: '3g' },
      { herb: '진피', dose: '6g' },
      { herb: '승마', dose: '3g' },
      { herb: '시호', dose: '3g' },
    ],
    efficacy:
      '補中益氣, 升陽舉陷. 비위(脾胃)의 기를 보하고, 처진 양기를 끌어올린다. 이동원(李東垣)이 비위론(脾胃論)에서 창안한 처방으로, 비기허(脾氣虛)로 인해 중기가 하함(下陷)하는 증상을 치료한다.',
    indications:
      '비기허증(脾氣虛證): 사지무력, 권태감, 식욕부진, 대변당설. 중기하함증(中氣下陷證): 탈항(脫肛), 자궁하수, 위하수, 유기부전, 만성 설사. 기허발열(氣虛發熱): 오후에 미열이 나고 자한이 있으며, 갈증이 있고 따뜻한 것을 좋아하는 경우. 기허불고(氣虛不固): 월경과다, 부정출혈, 반복 유산.',
    cautions:
      '음허화왕(陰虛火旺) 시 부적합. 습열(濕熱) 조건에서 사용 주의. 고혈압 환자는 승마·시호의 승양 작용에 주의. 감기 급성기에는 사용하지 않는다.',
    source: 'OASIS 한약처방',
    historical_notes:
      '비위론(脾胃論) 이동원(李東垣) 1249년. 동의보감(東醫寶鑑) 1613년 수재. 방약합편(方藥合編) 1885년.',
    original_id: '2',
  };

  const chunks2 = chunkPrescription(rx2, 2);
  assert(chunks2.length >= 1, `보중익기탕 청크: ${chunks2.length}개`);

  const validation2 = validateChunks(chunks2, undefined, true);
  assert(
    validation2.oversizedChunks.length === 0,
    `보중익기탕: 상한 초과 없음 (청크별 토큰: ${chunks2.map((c) => c.token_count).join(', ')})`,
  );

  console.log(`  [정보] 처방 청크 상세:`);
  for (const c of [...chunks1, ...chunks2]) {
    console.log(`    ${c.id}: ${c.token_count}토큰 | ${c.content.substring(0, 60)}...`);
  }
}

// ─── 테스트 5: 종합 검증 ───

function testIntegration(): void {
  console.log('\n=== 테스트 5: 종합 검증 ===');

  // 경전
  const classicChunks = chunkClassicText(
    '心者 君主之官也 神明出焉. 肺者 相傅之官也 治節出焉.',
    { book: '동의보감', volume: '내경편', chapter: '권1', section: '臟腑' },
  );

  // 약재 3건
  const herbChunks = [
    ...chunkHerb(
      {
        name: '감초',
        name_hanja: '甘草',
        properties: '甘平',
        meridians: '心, 肺, 脾, 胃',
        efficacy: '補脾益氣, 清熱解毒, 祛痰止咳, 緩急止痛, 調和諸藥',
        source: 'OASIS 한약재백과',
      },
      1,
    ),
    ...chunkHerb(
      {
        name: '당귀',
        name_hanja: '當歸',
        properties: '甘辛溫',
        meridians: '肝, 心, 脾',
        efficacy: '補血活血, 調經止痛, 潤腸通便',
        source: 'OASIS 한약재백과',
      },
      2,
    ),
    ...chunkHerb(
      {
        name: '천궁',
        name_hanja: '川芎',
        properties: '辛溫',
        meridians: '肝, 膽, 心包',
        efficacy: '活血行氣, 祛風止痛',
        source: 'OASIS 한약재백과',
      },
      3,
    ),
  ];

  // 처방 1건
  const rxChunks = chunkPrescription(
    {
      name: '사물탕',
      name_hanja: '四物湯',
      ingredients: [
        { herb: '숙지황', dose: '12g' },
        { herb: '당귀', dose: '9g' },
        { herb: '백작약', dose: '9g' },
        { herb: '천궁', dose: '6g' },
      ],
      efficacy: '補血調血',
      indications: '혈허증(血虛證), 월경부조, 안색창백, 두훈목현',
      source: 'OASIS 한약처방',
    },
    1,
  );

  const allChunks = [...classicChunks, ...herbChunks, ...rxChunks];
  assert(allChunks.length > 0, `종합 청크 수: ${allChunks.length}개`);

  // 카테고리 분포
  const categories = allChunks.reduce(
    (acc, c) => {
      acc[c.metadata.category] = (acc[c.metadata.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log(`  [정보] 카테고리 분포: ${JSON.stringify(categories)}`);

  // 모든 ID 고유성
  const ids = allChunks.map((c) => c.id);
  const uniqueIds = new Set(ids);
  assert(ids.length === uniqueIds.size, `모든 청크 ID 고유 (${uniqueIds.size}/${ids.length})`);

  // 모든 메타데이터 필수 필드
  assert(
    allChunks.every(
      (c) => c.metadata.source && c.metadata.category && c.metadata.title,
    ),
    '모든 청크에 필수 메타데이터(source, category, title) 포함',
  );

  // 상한 검증
  const validation = validateChunks(allChunks, undefined, true);
  assert(
    validation.oversizedChunks.length === 0,
    `전체 상한 초과 없음`,
  );
  console.log(`\n${formatValidationReport(validation)}`);
}

// ─── 실행 ───

function main(): void {
  console.log('============================================');
  console.log(' 한의학 데이터 청킹 모듈 테스트');
  console.log('============================================');

  testTokenCount();
  testClassicTextChunking();
  testHerbChunking();
  testPrescriptionChunking();
  testIntegration();

  console.log('\n============================================');
  console.log(` 결과: ${passed} PASS / ${failed} FAIL`);
  console.log('============================================');

  process.exit(failed > 0 ? 1 : 0);
}

main();
