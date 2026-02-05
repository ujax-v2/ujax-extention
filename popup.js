// 팝업 스크립트

const resultDiv = document.getElementById('result');
const submitBtn = document.getElementById('submitBtn');
const checkResultBtn = document.getElementById('checkResultBtn');
const problemIdInput = document.getElementById('problemId');
const languageSelect = document.getElementById('language');
const codeTextarea = document.getElementById('code');

// 결과 표시
function showResult(message, type = 'info') {
  resultDiv.className = type;
  if (typeof message === 'object') {
    resultDiv.textContent = JSON.stringify(message, null, 2);
  } else {
    resultDiv.textContent = message;
  }
}

// 결과 상태에 따른 색상 클래스
function getStatusClass(status) {
  if (status === 'ac') return 'success';
  if (status === 'wa' || status === 'rte' || status === 'ce' || status === 'tle' || status === 'mle') return 'error';
  if (status === 'wait' || status === 'judging' || status.includes('judging')) return 'pending';
  return '';
}

// 결과 포맷팅
function formatResults(results) {
  if (!results || results.length === 0) {
    return '제출 기록이 없습니다.';
  }

  return results.map(r => {
    return `[${r.solutionId}] ${r.result}
  메모리: ${r.memory}, 시간: ${r.time}
  언어: ${r.language}, 길이: ${r.codeLength}`;
  }).join('\n\n');
}

// 제출 버튼 클릭
submitBtn.addEventListener('click', async () => {
  const problemId = problemIdInput.value.trim();
  const language = languageSelect.value;
  const code = codeTextarea.value;

  if (!problemId) {
    showResult('문제 번호를 입력하세요.', 'error');
    return;
  }

  if (!code) {
    showResult('코드를 입력하세요.', 'error');
    return;
  }

  showResult('제출 페이지를 여는 중...', 'pending');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'submit',
      problemId,
      language,
      code
    });

    if (response.success) {
      showResult(`✓ ${response.data.message}\n\n페이지가 이동하면 결과를 확인하세요.`, 'success');
    } else {
      showResult(`✗ 오류: ${response.error}`, 'error');
    }
  } catch (error) {
    showResult(`✗ 오류: ${error.message}`, 'error');
  }
});

// 결과 확인 버튼 클릭
checkResultBtn.addEventListener('click', async () => {
  const problemId = problemIdInput.value.trim();

  if (!problemId) {
    showResult('문제 번호를 입력하세요.', 'error');
    return;
  }

  showResult('결과 조회 중...', 'pending');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkResult',
      problemId
    });

    if (response.success) {
      const formatted = formatResults(response.data.results);
      showResult(formatted, response.data.results.length > 0 ? getStatusClass(response.data.results[0].status) : '');
    } else {
      showResult(`✗ 오류: ${response.error}`, 'error');
    }
  } catch (error) {
    showResult(`✗ 오류: ${error.message}`, 'error');
  }
});

// 샘플 코드 (1000번 A+B 문제)
const sampleCode = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`;

// 초기 샘플 코드 설정
problemIdInput.value = '1000';
codeTextarea.value = sampleCode;
languageSelect.value = '93';  // Java 11
