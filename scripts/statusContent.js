// statusContent.js
// ──────────────────────────────────────────────────────────────
// 백준 채점 현황 페이지(acmicpc.net/status)에서 실행되는 Content Script
// 제출 테이블의 행을 파싱하여 채점 완료된 제출 데이터를 background.js로 전달한다.
//
// 채점 현황 테이블 구조 (#status-table):
//   제출 번호 | 아이디 | 문제 | 결과 | 메모리 | 시간 | 언어 | 코드 길이
// ──────────────────────────────────────────────────────────────
(function () {
  // 채점 중인 verdict (최종 결과가 아닌 상태)
  const PENDING_VERDICTS = [
    "채점 중", "기다리는 중", "채점 준비 중", "컴파일 중",
    "Judging", "Waiting", "Compiling", "Preparing",
  ];

  // 이미 전송한 제출 번호 (페이지 내 중복 방지)
  const sentSubmissions = new Set();

  /**
   * 테이블의 한 행(<tr>)에서 제출 데이터를 추출한다.
   * 최종 verdict가 아직 나오지 않았으면 null을 반환한다.
   */
  function parseRow(tr) {
    const tds = tr.querySelectorAll("td");
    if (tds.length < 8) return null;

    const submissionId = Number(tds[0].textContent.trim());
    const username = tds[1].textContent.trim();
    const problemNum = Number(
      tds[2].querySelector("a")?.textContent.trim() || tds[2].textContent.trim()
    );
    const verdictEl = tds[3].querySelector(".result-text") || tds[3];
    const verdict = verdictEl.textContent.trim();
    const memory = tds[4].textContent.trim();
    const time = tds[5].textContent.trim();
    const language = tds[6].textContent.trim();
    const codeLength = tds[7].textContent.trim();

    if (!submissionId || !problemNum) return null;

    // 채점 중이면 아직 최종 결과가 아님
    if (PENDING_VERDICTS.some((p) => verdict.includes(p))) return null;

    return { submissionId, problemNum, username, verdict, time, memory, language, codeLength };
  }

  /**
   * 테이블 전체를 스캔하여 아직 전송하지 않은 완료된 제출을 background.js로 전달한다.
   */
  function scanTable() {
    const table = document.getElementById("status-table");
    if (!table) return;

    const rows = table.querySelectorAll("tbody tr");
    for (const tr of rows) {
      const data = parseRow(tr);
      if (!data) continue;
      if (sentSubmissions.has(data.submissionId)) continue;

      sentSubmissions.add(data.submissionId);
      chrome.runtime.sendMessage({ type: "submissionData", data });
      console.log(`[UJAX] 제출 데이터 전송: ${data.submissionId}번 (${data.verdict})`);
    }
  }

  // 초기 스캔
  scanTable();

  // MutationObserver로 채점 결과 변경 감지 (실시간 채점 업데이트 대응)
  const table = document.getElementById("status-table");
  if (table) {
    const observer = new MutationObserver(() => scanTable());
    observer.observe(table, { childList: true, subtree: true, characterData: true });
  }

  console.log("[UJAX] 채점 현황 모니터링 시작");
})();
