// background.js (Service Worker)
// ──────────────────────────────────────────────────────────────
// 문제 데이터 수신 → 중복 체크 → solved.ac 보강 → 백엔드 전송
// ──────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8080";
const PROBLEM_INGEST_PATH = "/api/v1/problems/ingest";
const SUBMISSION_INGEST_PATH = "/api/v1/submissions/ingest";

// solved.ac 티어 매핑 (0~30)
const TIER_NAMES = [
  "Unrated",
  "Bronze V", "Bronze IV", "Bronze III", "Bronze II", "Bronze I",
  "Silver V", "Silver IV", "Silver III", "Silver II", "Silver I",
  "Gold V", "Gold IV", "Gold III", "Gold II", "Gold I",
  "Platinum V", "Platinum IV", "Platinum III", "Platinum II", "Platinum I",
  "Diamond V", "Diamond IV", "Diamond III", "Diamond II", "Diamond I",
  "Ruby V", "Ruby IV", "Ruby III", "Ruby II", "Ruby I",
];

// ──────────────────────────────────────────────────────────────
// [중복 크롤링 방지 패턴]
//
// 구현 방식: chrome.storage.local에 크롤링 완료된 문제 번호 Set을 캐싱한다.
//
// 1단계: 로컬 캐시 확인 (네트워크 비용 0)
//   - chrome.storage.local에서 "crawledProblems" 키를 조회
//   - 해당 문제 번호가 이미 있으면 → 크롤링 스킵 (API 호출 없음)
//
// 2단계: 백엔드 전송 결과로 캐시 갱신
//   - 200 OK (신규 등록 성공) → 캐시에 추가
//   - 409 Conflict (이미 존재) → 캐시에 추가 (다음부터 스킵)
//   - 그 외 에러 → 캐시에 추가하지 않음 (다음 방문 시 재시도)
//
// 장점:
//   - 로컬 캐시 히트 시 네트워크 요청 0회 (즉시 스킵)
//   - 캐시 미스여도 백엔드가 409로 중복을 막아주므로 데이터 정합성 보장
//   - 확장 삭제/재설치 시 캐시가 초기화되지만, 백엔드 409가 방어
//
// 대안 패턴 (미구현, 필요 시 전환 가능):
//   - TTL 캐시: 일정 기간 후 만료하여 문제 업데이트를 반영
//     예) { problemNum: 1000, cachedAt: timestamp } → 7일 경과 시 재크롤링
//   - 백엔드 조회 우선: GET /api/v1/problems/number/{num} 으로 존재 여부 확인 후 크롤링
//     네트워크 비용이 발생하지만 캐시 불일치 문제 없음
//   - ETag/Last-Modified: 백엔드가 문제 수정 시각을 반환, 변경 시에만 재크롤링
// ──────────────────────────────────────────────────────────────

async function getCrawledSet() {
  const { crawledProblems } = await chrome.storage.local.get("crawledProblems");
  return new Set(crawledProblems || []);
}

async function addToCrawledSet(problemNum) {
  const set = await getCrawledSet();
  set.add(problemNum);
  await chrome.storage.local.set({ crawledProblems: [...set] });
}

async function isAlreadyCrawled(problemNum) {
  const set = await getCrawledSet();
  return set.has(problemNum);
}

// ──────────────────────────────────────────────────────────────
// solved.ac API로 티어/태그 보강
// ──────────────────────────────────────────────────────────────
async function fetchSolvedAcMetadata(problemNum) {
  try {
    const res = await fetch(
      `https://solved.ac/api/v3/problem/show?problemId=${problemNum}`
    );
    if (!res.ok) return { tier: "Unrated", tags: [] };
    const data = await res.json();

    const tier =
      typeof data.level === "number" && TIER_NAMES[data.level]
        ? TIER_NAMES[data.level]
        : "Unrated";

    const tags = (data.tags || []).map((t) => {
      const ko = (t.displayNames || []).find((d) => d.language === "ko");
      return ko ? ko.name : t.displayNames?.[0]?.name || "";
    }).filter(Boolean);

    return { tier, tags };
  } catch {
    return { tier: "Unrated", tags: [] };
  }
}

// ──────────────────────────────────────────────────────────────
// 백엔드 API 전송
// ──────────────────────────────────────────────────────────────
async function sendToBackend(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res;
}

// ──────────────────────────────────────────────────────────────
// 메시지 핸들러
// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// [제출 데이터 흐름]
//
// 1. statusContent.js가 채점 현황 테이블에서 완료된 제출을 감지
//    → { type: "submissionData", data: { submissionId, problemNum, ... } }
//
// 2. background.js가 소스 코드 페이지를 fetch하여 코드를 추출
//    → 소스 코드 페이지 HTML에서 <textarea class="no-mathjax codemirror-textarea">를 파싱
//    → 인증이 필요하므로 fetch에 credentials: "include" 사용
//
// 3. 제출 데이터 + 소스 코드를 백엔드 /api/v1/submissions/ingest로 전송
//
// 소스 코드를 가져올 수 없는 경우 (비공개, 권한 없음 등):
//   → code를 빈 문자열로 보내고, 나머지 데이터만 저장
// ──────────────────────────────────────────────────────────────

// 제출 중복 방지 캐시 (문제 캐시와 동일한 패턴)
async function getSentSubmissionSet() {
  const { sentSubmissions } = await chrome.storage.local.get("sentSubmissions");
  return new Set(sentSubmissions || []);
}

async function addToSentSubmissionSet(submissionId) {
  const set = await getSentSubmissionSet();
  set.add(submissionId);
  await chrome.storage.local.set({ sentSubmissions: [...set] });
}

async function isAlreadySentSubmission(submissionId) {
  const set = await getSentSubmissionSet();
  return set.has(submissionId);
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "problemData") {
    handleProblemData(message.data);
    return;
  }

  if (message?.type === "submissionData") {
    handleSubmissionData(message.data);
    return;
  }

  // popup에서 수동 크롤링 요청
  if (message?.type === "manualCrawl") {
    const problemNum = message.problemNum;
    chrome.tabs.create({
      url: `https://www.acmicpc.net/problem/${problemNum}`,
      active: true,
    });
    return;
  }
});

async function handleProblemData(data) {
  const problemNum = Number(data.problemNum);
  if (!problemNum || !data.title) return;

  // 1단계: 로컬 캐시 확인 → 이미 크롤링된 문제면 스킵
  if (await isAlreadyCrawled(problemNum)) {
    console.log(`[UJAX] 스킵: ${problemNum}번 (이미 수집됨)`);
    return;
  }

  // solved.ac에서 티어/태그 보강
  const solvedAc = await fetchSolvedAcMetadata(problemNum);

  // 태그: content script에서 받은 것 + solved.ac 보강
  const contentTags = Array.isArray(data.tags) ? data.tags : [];
  const mergedTags = solvedAc.tags.length > 0 ? solvedAc.tags : contentTags;

  const payload = {
    problemNum: problemNum,
    title: data.title,
    tier: solvedAc.tier,
    timeLimit: data.timeLimit || "",
    memoryLimit: data.memoryLimit || "",
    problemDesc: data.description || "",
    problemInput: data.inputDescription || "",
    problemOutput: data.outputDescription || "",
    url: data.url || `https://www.acmicpc.net/problem/${problemNum}`,
    samples: (data.samples || []).map((s) => ({
      sampleIndex: s.sampleIndex,
      input: s.input || "",
      output: s.output || "",
    })),
    tags: mergedTags.map((name) => ({ name: String(name) })),
  };

  try {
    const res = await sendToBackend(PROBLEM_INGEST_PATH, payload);

    if (res.ok) {
      // 2단계-a: 신규 등록 성공 → 캐시에 추가
      await addToCrawledSet(problemNum);
      console.log(`[UJAX] 등록 완료: ${problemNum}번 ${data.title}`);
    } else if (res.status === 409) {
      // 2단계-b: 이미 존재 (409 Conflict) → 캐시에 추가하여 다음부터 스킵
      await addToCrawledSet(problemNum);
      console.log(`[UJAX] 이미 등록됨: ${problemNum}번 (캐시 갱신)`);
    } else {
      // 2단계-c: 기타 에러 → 캐시에 추가하지 않음 (다음 방문 시 재시도)
      console.warn(`[UJAX] 등록 실패: ${problemNum}번 (HTTP ${res.status})`);
    }
  } catch (err) {
    console.error(`[UJAX] 네트워크 오류: ${problemNum}번`, err.message);
  }
}

// ──────────────────────────────────────────────────────────────
// 제출 데이터 처리
// ──────────────────────────────────────────────────────────────

/**
 * 소스 코드 페이지를 fetch하여 코드를 추출한다.
 * 백준 소스 코드 페이지의 <textarea class="no-mathjax codemirror-textarea">에서 추출.
 * 권한이 없거나 비공개인 경우 빈 문자열을 반환한다.
 */
async function fetchSourceCode(submissionId) {
  try {
    const res = await fetch(
      `https://www.acmicpc.net/source/${submissionId}`,
      { credentials: "include" }
    );
    if (!res.ok) return "";

    const html = await res.text();
    // <textarea class="no-mathjax codemirror-textarea" ...>소스코드</textarea>
    const match = html.match(
      /<textarea[^>]*class="[^"]*codemirror-textarea[^"]*"[^>]*>([\s\S]*?)<\/textarea>/
    );
    return match ? match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : "";
  } catch {
    return "";
  }
}

async function handleSubmissionData(data) {
  const submissionId = Number(data.submissionId);
  if (!submissionId) return;

  // 로컬 캐시 확인 → 이미 전송한 제출이면 스킵
  if (await isAlreadySentSubmission(submissionId)) {
    console.log(`[UJAX] 제출 스킵: ${submissionId}번 (이미 전송됨)`);
    return;
  }

  // 소스 코드 가져오기
  const code = await fetchSourceCode(submissionId);

  const payload = {
    submissionId: submissionId,
    problemNum: data.problemNum,
    username: data.username,
    verdict: data.verdict,
    time: data.time || "",
    memory: data.memory || "",
    language: data.language || "",
    codeLength: data.codeLength || "",
    code: code,
  };

  try {
    const res = await sendToBackend(SUBMISSION_INGEST_PATH, payload);

    if (res.ok) {
      await addToSentSubmissionSet(submissionId);
      console.log(`[UJAX] 제출 등록 완료: ${submissionId}번 (${data.verdict})`);
    } else if (res.status === 409) {
      await addToSentSubmissionSet(submissionId);
      console.log(`[UJAX] 제출 이미 등록됨: ${submissionId}번 (캐시 갱신)`);
    } else {
      console.warn(`[UJAX] 제출 등록 실패: ${submissionId}번 (HTTP ${res.status})`);
    }
  } catch (err) {
    console.error(`[UJAX] 제출 네트워크 오류: ${submissionId}번`, err.message);
  }
}

console.log("[UJAX] Background service worker 시작");
