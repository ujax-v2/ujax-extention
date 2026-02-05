// 백준 제출 백그라운드 서비스

const SERVER_URL = 'http://localhost:3000';

// 제출 페이지 열고 코드 제출
async function openAndSubmit(problemId, language, code, autoClose = true) {
  // storage에 제출 정보 저장
  await chrome.storage.local.set({
    pendingSubmit: {
      problemId,
      language,
      code,
      autoClose,
      timestamp: Date.now()
    }
  });

  // 제출 페이지 URL
  const submitUrl = `https://www.acmicpc.net/submit/${problemId}`;

  // 새 탭에서 제출 페이지 열기
  const tab = await chrome.tabs.create({ url: submitUrl, active: true });

  return { success: true, message: '제출 페이지가 열렸습니다.' };
}

// 서버에서 대기 중인 제출 확인
async function checkServerForPending() {
  try {
    const response = await fetch(`${SERVER_URL}/pending`, {
      method: 'GET'
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data && data.problemId) {
      console.log('BOJ Extension: 서버에서 제출 요청 감지', data);

      // 서버의 pending 클리어
      await fetch(`${SERVER_URL}/pending`, { method: 'DELETE' });

      // 제출 실행
      await openAndSubmit(data.problemId, data.language, data.code, data.autoClose !== false);

      return data;
    }
  } catch (e) {
    // 서버 연결 안 됨 - 무시
  }

  return null;
}

// 주기적으로 서버 확인 (1초마다)
setInterval(checkServerForPending, 1000);

// 최근 제출 결과 가져오기
async function getLatestResult(problemId) {
  const response = await fetch(`https://www.acmicpc.net/status?problem_id=${problemId}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`결과 페이지 접근 실패: ${response.status}`);
  }

  const html = await response.text();
  const results = parseStatusTable(html);

  if (results.length === 0) {
    return {
      message: '제출 기록이 없습니다.',
      results: []
    };
  }

  return {
    message: '결과 조회 완료',
    results: results.slice(0, 5)
  };
}

// 상태 테이블 파싱
function parseStatusTable(html) {
  const results = [];
  const rowRegex = /<tr[^>]*id="solution-(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const solutionId = match[1];
    const rowHtml = match[2];

    const resultMatch = rowHtml.match(/class="result[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
    const result = resultMatch ? resultMatch[1].trim() : 'Unknown';

    const statusMatch = rowHtml.match(/class="result-([^"]+)"/);
    const status = statusMatch ? statusMatch[1] : 'unknown';

    const memoryMatch = rowHtml.match(/<td class="memory">(\d+)/);
    const memory = memoryMatch ? memoryMatch[1] + ' KB' : '-';

    const timeMatch = rowHtml.match(/<td class="time">(\d+)/);
    const time = timeMatch ? timeMatch[1] + ' ms' : '-';

    const langMatch = rowHtml.match(/<td class="[^"]*language[^"]*"[^>]*>([^<]+)/);
    const language = langMatch ? langMatch[1].trim() : '-';

    const lengthMatch = rowHtml.match(/<td class="[^"]*length[^"]*"[^>]*>([^<]+)/);
    const codeLength = lengthMatch ? lengthMatch[1].trim() : '-';

    results.push({
      solutionId,
      result,
      status,
      memory,
      time,
      language,
      codeLength
    });
  }

  return results;
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'submit') {
    openAndSubmit(request.problemId, request.language, request.code, true)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'checkResult') {
    getLatestResult(request.problemId)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

console.log('BOJ Extension: Background service started, polling server at', SERVER_URL);
