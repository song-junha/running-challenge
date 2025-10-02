# 🏃‍♂️ 러닝 기록 비교 앱

친구들과 함께 러닝 기록을 비교하는 웹 앱입니다.

## 🏠 집 컴퓨터에서 처음 시작하기

### 1. 필수 프로그램 설치
```bash
# Node.js 설치 (https://nodejs.org/)
# Git 설치 (https://git-scm.com/)
```

### 2. 저장소 클론
```bash
git clone https://github.com/YOUR_USERNAME/running.git
cd running
```

### 3. 패키지 설치
```bash
npm install
```

### 4. CSS 빌드 (필수!)
```bash
npm run build:css
```

### 5. 환경 변수 설정
`.env` 파일 생성하고 Strava API 키 입력:
```
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://localhost:3000/auth/strava/callback
```

### 6. 서버 실행
```bash
npm start
```

### 7. 브라우저에서 열기
```
http://localhost:3000
```

## 🚀 빠른 시작 (이미 설정된 경우)

```bash
git pull                    # 최신 코드 가져오기
npm install                 # 새 패키지 있으면 설치
npm run build:css          # CSS 빌드
npm start                  # 서버 실행
```

## 📁 프로젝트 구조

```
running/
├── server.js              # Express 서버
├── database.js            # SQLite 데이터베이스 설정
├── running.db             # 데이터베이스 파일 (자동 생성)
├── package.json           # 프로젝트 설정
├── tailwind.config.js     # Tailwind 테마 설정 ⭐
├── .env                   # 환경 변수
├── .gitignore
└── public/
    ├── index.html         # 메인 페이지
    ├── admin.html         # 관리자 페이지
    ├── app.js             # 프론트엔드 JS
    ├── admin.js           # 관리자 페이지 JS
    ├── input.css          # Tailwind 입력 파일
    └── output.css         # 빌드된 CSS (git에 포함)
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

- ✅ Strava OAuth 연동
- ✅ 자동 데이터 동기화 (첫 연동 5년, 이후 1년)
- ✅ 기간별 통계 (이번달, 저번달, 올해, 작년)
- ✅ 총 거리, 시간, 페이스, 심박수, 케이던스 표시
- ✅ 개인 기록 (5K, 10K, Half, Full)
- ✅ 관리자 페이지 (계정 관리)
- ✅ 최근 활동 목록
- ✅ 비공개 활동 필터링

## 🛠 기술 스택

- **Backend**: Node.js + Express
- **Database**: SQLite3
- **Frontend**: Vanilla JavaScript
- **CSS**: Tailwind CSS + DaisyUI (커스텀 테마)
- **API**: Strava API v3

## 🎨 테마 커스터마이징

테마 색상을 바꾸려면:

1. `tailwind.config.js`에서 색상 수정
2. `npm run build:css` 실행
3. 브라우저 새로고침

개발 중에는 `npm run watch:css`를 실행해두면 파일이 바뀔 때마다 자동 빌드됩니다!

## 📝 주요 npm 스크립트

```bash
npm start          # 서버 실행
npm run dev        # 개발 모드 (nodemon)
npm run build:css  # CSS 빌드 (한번만)
npm run watch:css  # CSS 자동 빌드 (개발시)
```

---


문의: songjunha@example.com
