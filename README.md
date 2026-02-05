# BOJ Submit Extension

백준 온라인 저지(BOJ)에 코드를 자동으로 제출하고 결과를 확인하는 Chrome Extension입니다.
외부 환경(코드스페이스 등)에서 HTTP API를 통해 제출할 수 있습니다.

## 기술적 결정 배경

### 왜 Chrome Extension인가?

처음에는 **서버에서 직접 백준 API를 호출**하는 방식을 시도했습니다. 하지만 다음과 같은 문제가 있었습니다:

1. **Cloudflare 보호**: 백준은 Cloudflare를 사용하여 봇 요청을 차단합니다 (403 Forbidden)
2. **reCAPTCHA**: 로그인 페이지에 reCAPTCHA가 적용되어 자동 로그인이 불가능
3. **Turnstile**: 제출 페이지에 Cloudflare Turnstile이 적용되어 자동 제출이 차단됨

이러한 보안 메커니즘을 우회하기 위해 **Chrome Extension + Content Script** 방식을 선택했습니다.
브라우저 내에서 실행되므로 정상적인 사용자 요청으로 인식됩니다.

### 왜 로컬 서버가 필요한가?

코드스페이스 등 외부 환경에서 제출하려면 Extension과 통신할 방법이 필요합니다.
Chrome Extension은 외부에서 직접 호출할 수 없으므로, **폴링 방식**을 사용합니다:

1. 로컬 서버가 HTTP 요청을 받아 대기열에 저장
2. Extension의 Background Script가 1초마다 서버를 폴링
3. 대기 중인 요청이 있으면 제출 페이지를 열고 처리

## 아키텍처

```
┌─────────────────┐     HTTP      ┌─────────────────┐
│   코드스페이스    │ ──────────▶  │   로컬 서버      │
│   (curl/fetch)  │              │  (localhost:3000)│
└─────────────────┘              └────────┬────────┘
                                          │
                                    폴링 (1초)
                                          │
                                          ▼
                                 ┌─────────────────┐
                                 │   Extension     │
                                 │ Background.js   │
                                 └────────┬────────┘
                                          │
                                   탭 열기 + 메시지
                                          │
                                          ▼
┌─────────────────┐              ┌─────────────────┐
│   백준 결과     │ ◀─────────── │  Content Script │
│   (status)     │   제출 완료   │  (submit 페이지) │
└─────────────────┘              └─────────────────┘
```

## 동작 흐름

1. **제출 요청**: curl로 로컬 서버에 코드 전송
2. **폴링**: Extension이 서버에서 대기 중인 요청 감지
3. **페이지 열기**: 백준 제출 페이지를 새 탭으로 오픈
4. **코드 입력**: Content Script가 CodeMirror 에디터에 코드 삽입
5. **Turnstile 대기**: 봇 검증 완료까지 대기 (최대 10초)
6. **자동 제출**: 제출 버튼 클릭
7. **결과 확인**: status 페이지로 이동 후 채점 완료까지 대기
8. **탭 닫기**: 결과 확인 후 자동으로 탭 종료

## 설치

### 1. Extension 설치

1. Chrome에서 `chrome://extensions/` 열기
2. 우측 상단 **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. `extension` 폴더 선택 (server 폴더 아님!)

### 2. 로컬 서버 설치

```bash
cd extension/server
npm install
npm start
```

### 3. 백준 로그인

브라우저에서 [백준](https://www.acmicpc.net)에 로그인해주세요.
Extension은 브라우저의 로그인 세션을 사용합니다.

## 사용법

### 방법 1: Extension 팝업

1. Chrome 툴바에서 Extension 아이콘 클릭
2. 문제 번호, 언어, 코드 입력
3. 제출 버튼 클릭

### 방법 2: HTTP API (코드스페이스용)

**직접 코드 제출:**
```bash
curl -X POST http://localhost:3000/submit \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "1000",
    "language": "93",
    "code": "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        int b = sc.nextInt();\n        System.out.println(a + b);\n    }\n}"
  }'
```

**파일로 제출:**
```bash
curl -X POST http://localhost:3000/submit-file \
  -H "Content-Type: application/json" \
  -d '{
    "problemId": "1000",
    "language": "93",
    "filePath": "./Main.java"
  }'
```

## 언어 코드

| 코드 | 언어 |
|------|------|
| 1001 | C++17 |
| 1003 | C++20 |
| 93 | Java 11 |
| 28 | Python 3 |
| 73 | PyPy3 |
| 17 | JavaScript (Node.js) |
| 69 | Kotlin (JVM) |
| 74 | Rust 2021 |
| 12 | Go |

전체 목록: `curl http://localhost:3000/languages`

## 파일 구조

```
extension/
├── manifest.json      # Extension 설정
├── background.js      # 서버 폴링 및 탭 관리
├── content.js         # 백준 페이지 조작 (코드 입력, 제출)
├── popup.html         # Extension 팝업 UI
├── popup.js           # 팝업 로직
├── README.md
└── server/
    ├── package.json
    └── server.js      # HTTP API 서버
```

## 주의사항

- 백준에 **로그인된 상태**여야 합니다
- 서버와 Extension이 **모두 실행 중**이어야 합니다
- 제출 시 브라우저 창이 **포커스**되어 있어야 Turnstile이 정상 동작합니다
- 너무 빠른 연속 제출은 백준에서 차단될 수 있습니다

## 트러블슈팅

### "소스 코드가 너무 짧아요" 오류
- 페이지 로딩이 완료되기 전에 제출됨
- Extension을 새로고침 후 다시 시도

### 제출 페이지가 열리지 않음
- Extension이 로드되었는지 확인 (`chrome://extensions/`)
- 서버가 실행 중인지 확인 (`curl http://localhost:3000/status`)

### Turnstile 검증 실패
- 브라우저 창을 포커스한 상태에서 다시 시도
- VPN 사용 시 끄고 시도
