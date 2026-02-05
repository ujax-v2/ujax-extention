const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 대기 중인 제출 정보
let pendingSubmit = null;

// 상태 확인
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    hasPending: !!pendingSubmit
  });
});

// 제출 요청 (코드스페이스에서 호출)
app.post('/submit', (req, res) => {
  const { problemId, language, code, autoClose } = req.body;

  if (!problemId || !language || !code) {
    return res.status(400).json({
      error: 'problemId, language, code가 필요합니다.',
      example: {
        problemId: '1000',
        language: '93',
        code: 'public class Main { ... }'
      }
    });
  }

  // pending에 저장 (Extension이 가져감)
  pendingSubmit = {
    problemId: String(problemId),
    language: String(language),
    code,
    autoClose: autoClose !== false,
    timestamp: Date.now()
  };

  console.log(`[${new Date().toLocaleTimeString()}] 제출 요청 접수: 문제 ${problemId}, 언어 ${language}, 코드 ${code.length}자`);

  res.json({
    success: true,
    message: '제출 요청이 접수되었습니다. Extension이 처리합니다.',
    problemId,
    language
  });
});

// 파일에서 코드 읽어서 제출
app.post('/submit-file', (req, res) => {
  const { problemId, language, filePath, autoClose } = req.body;

  if (!problemId || !language || !filePath) {
    return res.status(400).json({
      error: 'problemId, language, filePath가 필요합니다.'
    });
  }

  try {
    const absolutePath = path.resolve(filePath);
    const code = fs.readFileSync(absolutePath, 'utf-8');

    pendingSubmit = {
      problemId: String(problemId),
      language: String(language),
      code,
      autoClose: autoClose !== false,
      timestamp: Date.now()
    };

    console.log(`[${new Date().toLocaleTimeString()}] 파일 제출 요청: 문제 ${problemId}, 파일 ${filePath}`);

    res.json({
      success: true,
      message: '제출 요청이 접수되었습니다.',
      problemId,
      language,
      codeLength: code.length
    });
  } catch (error) {
    res.status(400).json({ error: `파일 읽기 실패: ${error.message}` });
  }
});

// Extension이 pending 가져감
app.get('/pending', (req, res) => {
  if (pendingSubmit) {
    res.json(pendingSubmit);
  } else {
    res.json(null);
  }
});

// pending 클리어
app.delete('/pending', (req, res) => {
  pendingSubmit = null;
  res.json({ success: true });
});

// 언어 코드 목록
app.get('/languages', (req, res) => {
  res.json({
    languages: {
      '1001': 'C++17',
      '1003': 'C++20',
      '93': 'Java 11',
      '28': 'Python 3',
      '73': 'PyPy3',
      '17': 'JavaScript (Node.js)',
      '69': 'Kotlin (JVM)',
      '68': 'Ruby',
      '74': 'Rust 2021',
      '12': 'Go',
      '113': 'Swift'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  BOJ Submit Server (Extension 연동)');
  console.log('========================================');
  console.log(`  서버: http://localhost:${PORT}`);
  console.log('');
  console.log('  사용법 (코드스페이스에서):');
  console.log('');
  console.log('  1. 직접 코드 제출:');
  console.log('     curl -X POST http://localhost:3000/submit \\');
  console.log('       -H "Content-Type: application/json" \\');
  console.log('       -d \'{"problemId":"1000","language":"93","code":"코드"}\'');
  console.log('');
  console.log('  2. 파일로 제출:');
  console.log('     curl -X POST http://localhost:3000/submit-file \\');
  console.log('       -H "Content-Type: application/json" \\');
  console.log('       -d \'{"problemId":"1000","language":"93","filePath":"./Main.java"}\'');
  console.log('');
  console.log('  언어 코드: curl http://localhost:3000/languages');
  console.log('========================================');
  console.log('');
});
