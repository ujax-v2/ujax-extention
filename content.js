// Content Script - 백준 제출 페이지에서 실행됨

async function init() {
  console.log('BOJ Extension: Content script 시작');

  // status 페이지면 결과 확인 후 탭 닫기
  if (window.location.pathname === '/status') {
    await handleStatusPage();
    return;
  }

  // storage에서 제출 정보 가져오기
  const data = await chrome.storage.local.get('pendingSubmit');

  if (!data.pendingSubmit) {
    console.log('BOJ Extension: 대기 중인 제출 없음');
    return;
  }

  const { problemId, language, code, timestamp, autoClose } = data.pendingSubmit;

  // 5분 이상 된 요청은 무시
  if (Date.now() - timestamp > 5 * 60 * 1000) {
    console.log('BOJ Extension: 오래된 제출 요청 무시');
    await chrome.storage.local.remove('pendingSubmit');
    return;
  }

  // 현재 페이지가 맞는지 확인
  const currentProblem = window.location.pathname.split('/')[2];
  if (currentProblem !== problemId) {
    console.log('BOJ Extension: 문제 번호 불일치');
    return;
  }

  console.log('BOJ Extension: 제출 정보 발견, 코드 길이:', code.length);

  // autoClose 설정 저장 (status 페이지에서 사용)
  await chrome.storage.local.set({ autoClose: autoClose !== false });

  // 처리 후 pendingSubmit 클리어
  await chrome.storage.local.remove('pendingSubmit');

  // 페이지 로딩 대기
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 폼 채우기 실행
  await fillForm(language, code);
}

async function handleStatusPage() {
  const data = await chrome.storage.local.get('autoClose');

  if (!data.autoClose) {
    return;
  }

  console.log('BOJ Extension: Status 페이지 감지, 결과 확인 중...');
  showNotification('제출 완료! 결과 확인 후 탭이 닫힙니다...');

  // 최근 제출 결과 확인 (최대 30초 대기)
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;

    // 첫 번째 결과 행 확인
    const firstResult = document.querySelector('table#status-table tbody tr:first-child');
    if (!firstResult) continue;

    const resultSpan = firstResult.querySelector('.result-text span');
    if (!resultSpan) continue;

    const resultText = resultSpan.textContent.trim();

    // 채점 중이 아니면 완료
    if (!resultText.includes('채점') && !resultText.includes('기다리는') && !resultText.includes('wait')) {
      console.log('BOJ Extension: 채점 완료 -', resultText);

      // 결과에 따른 알림 색상
      const isSuccess = resultText.includes('맞았') || resultText.includes('Accepted');
      showNotification(`결과: ${resultText}`, isSuccess ? '#4CAF50' : '#f44336');

      // 3초 후 탭 닫기
      await new Promise(resolve => setTimeout(resolve, 3000));
      await chrome.storage.local.remove('autoClose');
      window.close();
      return;
    }
  }

  // 시간 초과
  showNotification('채점이 오래 걸리고 있습니다. 탭을 유지합니다.', '#ff9800');
  await chrome.storage.local.remove('autoClose');
}

async function fillForm(language, code) {
  // 1. 언어 선택
  const languageSelect = document.querySelector('select[name="language"]');
  if (languageSelect) {
    languageSelect.value = language;
    languageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('BOJ Extension: 언어 선택 완료');
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  // 2. CodeMirror에 코드 입력
  const cmWrapper = document.querySelector('.CodeMirror');

  if (cmWrapper) {
    const cmTextarea = cmWrapper.querySelector('textarea');

    if (cmTextarea) {
      console.log('BOJ Extension: CodeMirror textarea 발견');

      cmTextarea.focus();
      await new Promise(resolve => setTimeout(resolve, 100));

      cmTextarea.select();
      document.execCommand('selectAll', false, null);

      const success = document.execCommand('insertText', false, code);
      console.log('BOJ Extension: insertText 결과:', success);

      if (!success) {
        cmTextarea.value = code;
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: code
        });
        cmTextarea.dispatchEvent(inputEvent);
      }
    }
  }

  // 3. 숨겨진 source textarea도 업데이트
  const sourceTextarea = document.querySelector('textarea#source');
  if (sourceTextarea) {
    sourceTextarea.value = code;
    console.log('BOJ Extension: source textarea 업데이트');
  }

  // 4. Turnstile 로딩 대기 후 자동 제출
  console.log('BOJ Extension: Turnstile 로딩 대기 중...');
  showNotification('코드 입력 완료! 잠시 후 자동 제출됩니다...');

  let waited = 0;
  while (waited < 10000) {
    await new Promise(resolve => setTimeout(resolve, 500));
    waited += 500;

    const submitBtn = document.querySelector('button#submit_button');
    if (submitBtn && !submitBtn.disabled) {
      console.log('BOJ Extension: 제출 버튼 활성화됨, 제출 진행');
      await new Promise(resolve => setTimeout(resolve, 500));
      submitBtn.click();
      showNotification('제출 완료! 결과를 기다리는 중...');
      return;
    }
  }

  const submitBtn = document.querySelector('button#submit_button') ||
                    document.querySelector('button[type="submit"]');
  if (submitBtn) {
    console.log('BOJ Extension: 대기 시간 초과, 제출 시도');
    submitBtn.click();
    showNotification('제출 완료!');
  } else {
    showNotification('제출 버튼을 찾을 수 없습니다. 직접 제출해주세요.', '#f44336');
  }
}

function showNotification(message, bgColor = '#4CAF50') {
  // 기존 알림 제거
  const existing = document.querySelector('#boj-ext-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.id = 'boj-ext-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${bgColor};
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 5000);
}

// 페이지 로드 완료 후 실행
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}

console.log('BOJ Submit Extension: Content script loaded');
