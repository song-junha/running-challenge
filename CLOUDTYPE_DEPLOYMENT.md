# Cloudtype 배포 가이드

이 가이드는 러닝 챌린지 앱을 Cloudtype에 배포하는 방법을 설명합니다.

## 사전 준비

1. GitHub 레포지토리가 준비되어 있어야 합니다
2. [Cloudtype](https://cloudtype.io) 계정이 필요합니다
3. Strava API 앱이 생성되어 있어야 합니다

## 1단계: PostgreSQL 데이터베이스 생성

1. Cloudtype 대시보드에서 **새 프로젝트** 생성
2. **Database** 선택
3. **PostgreSQL** 선택
4. 데이터베이스 설정:
   - 이름: `running-challenge-db` (원하는 이름)
   - 버전: 최신 버전 선택
   - 플랜: 무료 또는 원하는 플랜
5. **배포** 클릭
6. 배포 완료 후 **연결 정보**에서 `DATABASE_URL` 복사 (나중에 사용)

## 2단계: 애플리케이션 배포

### 2-1. GitHub 레포지토리 연결

1. Cloudtype 대시보드에서 **새 서비스** 클릭
2. **GitHub** 선택하여 레포지토리 연결
3. 배포할 레포지토리 선택: `running-challenge`
4. 브랜치 선택: `main` (또는 배포할 브랜치)

### 2-2. 빌드 설정

1. **빌드 타입**: Node.js 자동 감지됨
2. **빌드 명령어** (선택사항):
   ```bash
   npm install && npm run build:css
   ```
3. **시작 명령어**:
   ```bash
   npm start
   ```
   (자동으로 `package.json`의 `start` 스크립트 사용)

### 2-3. 환경 변수 설정

**환경 변수** 섹션에서 다음 변수들을 추가:

```bash
# 서버 설정
NODE_ENV=production
PORT=8080

# 관리자 비밀번호 (강력한 비밀번호로 변경!)
ADMIN_PASSWORD=your_secure_password_here

# PostgreSQL 데이터베이스 (1단계에서 복사한 URL)
DATABASE_URL=postgresql://username:password@host:port/database

# Strava API 설정
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
STRAVA_REDIRECT_URI=https://your-app-name.cloudtype.app/auth/strava/callback
```

**중요**: `STRAVA_REDIRECT_URI`는 Cloudtype에서 제공하는 실제 배포 URL로 설정해야 합니다.

### 2-4. 리소스 설정

- **CPU**: 0.25 vCPU 이상 권장
- **Memory**: 512MB 이상 권장
- **포트**: 8080 (자동 설정됨)

### 2-5. 배포 실행

1. 모든 설정 확인
2. **배포** 버튼 클릭
3. 배포 진행 상황 모니터링

## 3단계: Strava API 설정 업데이트

배포가 완료되면 Strava API 설정을 업데이트해야 합니다:

1. [Strava API Settings](https://www.strava.com/settings/api) 접속
2. 해당 앱 선택
3. **Authorization Callback Domain**에 Cloudtype 도메인 추가:
   ```
   your-app-name.cloudtype.app
   ```
4. 변경사항 저장

## 4단계: 배포 확인

1. Cloudtype에서 제공하는 URL로 접속: `https://your-app-name.cloudtype.app`
2. Strava 연동 테스트
3. 데이터베이스 연결 확인

## 환경 변수 상세 설명

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `NODE_ENV` | 실행 환경 | `production` |
| `PORT` | 서버 포트 (Cloudtype 기본값) | `8080` |
| `ADMIN_PASSWORD` | 관리자 기능 비밀번호 | `secure_password_123` |
| `DATABASE_URL` | PostgreSQL 연결 URL | `postgresql://user:pass@host:5432/db` |
| `STRAVA_CLIENT_ID` | Strava API 클라이언트 ID | `12345` |
| `STRAVA_CLIENT_SECRET` | Strava API 시크릿 | `abc123...` |
| `STRAVA_REDIRECT_URI` | OAuth 콜백 URL | `https://your-app.cloudtype.app/auth/strava/callback` |

## 문제 해결

### ❌ DATABASE_URL 환경 변수가 설정되지 않았습니다

**증상:**
```
❌ 데이터베이스 초기화 실패: TypeError: Cannot read properties of undefined (reading 'searchParams')
```

**원인:** `DATABASE_URL` 환경 변수가 Cloudtype에 설정되지 않음

**해결 방법:**
1. Cloudtype 대시보드 → 해당 서비스 선택
2. **설정(Settings)** → **환경 변수(Environment Variables)** 메뉴
3. `DATABASE_URL` 변수 추가:
   ```
   DATABASE_URL=postgresql://username:password@host:port/database
   ```
4. **저장** 후 서비스 **재배포**

**주의:**
- 1단계에서 생성한 PostgreSQL 데이터베이스의 연결 정보를 정확히 복사
- 연결 문자열 형식이 `postgresql://`로 시작하는지 확인
- 비밀번호에 특수문자가 있으면 URL 인코딩 필요할 수 있음

### 데이터베이스 연결 오류

- `DATABASE_URL`이 올바르게 설정되었는지 확인
- PostgreSQL 데이터베이스가 실행 중인지 확인
- 연결 정보 (호스트, 포트, 사용자명, 비밀번호) 재확인
- 로그에서 구체적인 에러 메시지 확인

### Strava OAuth 오류

- `STRAVA_REDIRECT_URI`가 실제 배포 URL과 일치하는지 확인
- Strava API 설정에서 Authorization Callback Domain이 추가되었는지 확인
- `STRAVA_CLIENT_ID`와 `STRAVA_CLIENT_SECRET`이 올바른지 확인

### 빌드 오류

- `package.json`의 dependencies가 모두 포함되어 있는지 확인
- Node.js 버전 호환성 확인
- 로그 확인하여 구체적인 오류 메시지 파악

### CSS 파일이 로드되지 않음

- 배포 전 `npm run build:css` 실행 확인
- `public/output.css` 파일이 레포지토리에 포함되었는지 확인
- 빌드 명령어에 CSS 빌드가 포함되었는지 확인

## 자동 배포 설정

GitHub Actions를 통한 자동 배포를 원한다면:

1. Cloudtype 대시보드에서 **설정** > **GitHub Actions** 활성화
2. `main` 브랜치에 push 시 자동 배포됨

## 데이터베이스 백업

Cloudtype PostgreSQL은 자동 백업을 지원합니다:

- 대시보드에서 **데이터베이스** > **백업** 메뉴 확인
- 수동 백업 또는 자동 백업 스케줄 설정 가능

## 비용

- **무료 티어**: 제한된 리소스로 테스트 가능
- **유료 플랜**: 트래픽과 리소스에 따라 과금
- 자세한 요금은 [Cloudtype 요금 페이지](https://cloudtype.io/pricing) 참조

## 추가 리소스

- [Cloudtype 공식 문서](https://docs.cloudtype.io)
- [Cloudtype GitHub](https://github.com/cloudtype-io)
- [Strava API 문서](https://developers.strava.com)

## 배포 후 체크리스트

- [ ] 애플리케이션 URL로 접속 가능
- [ ] Strava OAuth 로그인 정상 작동
- [ ] 데이터베이스 연결 정상
- [ ] 활동 동기화 정상 작동
- [ ] 대회 등록/참가 기능 정상
- [ ] 관리자 기능 (삭제, 수정) 정상 작동
- [ ] HTTPS 인증서 정상 적용
- [ ] 환경 변수 보안 설정 확인

배포에 성공하셨다면 축하합니다! 🎉
