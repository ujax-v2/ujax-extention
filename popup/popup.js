// popup.js
// 수동 크롤링 트리거 + 수집 현황 표시
(function () {
  const numInput = document.getElementById("problemNum");
  const crawlBtn = document.getElementById("crawlBtn");
  const statusEl = document.getElementById("status");
  const countEl = document.getElementById("count");

  // 수집된 문제 수 표시
  chrome.storage.local.get("crawledProblems", ({ crawledProblems }) => {
    countEl.textContent = (crawledProblems || []).length;
  });

  crawlBtn.addEventListener("click", () => {
    const num = parseInt(numInput.value, 10);
    if (!num || num <= 0) {
      statusEl.textContent = "올바른 문제 번호를 입력하세요.";
      return;
    }

    // 백준 문제 페이지를 열면 content script가 자동으로 크롤링
    chrome.runtime.sendMessage({ type: "manualCrawl", problemNum: num });
    statusEl.textContent = `${num}번 문제 페이지를 여는 중...`;
  });

  // Enter 키로도 수집
  numInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") crawlBtn.click();
  });
})();
