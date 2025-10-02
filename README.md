# 🏃‍♂️ 러닝 기록 비교 앱

친구들과 함께 러닝 기록을 비교하는 웹 앱입니다.

## 🚀 시작하기

### 1. 패키지 설치
```bash
npm install
```

### 2. 서버 실행
```bash
npm start
```

개발 모드 (자동 재시작):
```bash
npm run dev
```

### 3. 브라우저에서 열기
```
http://localhost:3000
```

## 📁 프로젝트 구조

```
running/
├── server.js           # Express 서버
├── database.js         # SQLite 데이터베이스 설정
├── running.db          # 데이터베이스 파일 (자동 생성)
├── package.json        # 프로젝트 설정
├── .env                # 환경 변수
├── .gitignore
└── public/
    ├── index.html      # 메인 페이지
    └── app.js          # 프론트엔드 JavaScript
```

## ⚙️ Strava 연동 설정 (다음 단계)

1. https://www.strava.com/settings/api 접속
2. "Create An App" 클릭
3. 앱 정보 입력:
   - Application Name: 아무거나
   - Website: http://localhost:3000
   - Authorization Callback Domain: localhost
4. Client ID와 Client Secret을 `.env` 파일에 입력

## 🧪 테스트 데이터 추가하기

서버 실행 후, 다음 명령으로 테스트 사용자를 추가할 수 있습니다:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"홍길동","strava_id":"test123"}'
```

## 📊 주요 기능

- ✅ 친구들의 러닝 기록 비교
- ✅ 기간별 통계 (7일, 30일, 3개월)
- ✅ 총 거리, 시간, 페이스 표시
- ✅ 최근 활동 목록
- 🔜 Strava 자동 연동
- 🔜 리더보드
- 🔜 주간/월간 챌린지

## 🛠 기술 스택

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla JavaScript + HTML/CSS
- **API**: Strava API (예정)

## 📝 다음 할 일

1. Strava OAuth 연동 완료하기
2. 자동 데이터 동기화 기능 추가
3. 친구 추가/관리 기능
4. 가민(Garmin) 연동 추가


앞으로 테마 색상을 바꾸려면:
1. tailwind.config.js에서 색상 수정
2. npm run build:css 실행
3. 브라우저 새로고침

개발 중에는 npm run watch:css를 실행해두면 파일이 바뀔 때마다 자동으로 빌드됩니다!

---


문의: songjunha@example.com
