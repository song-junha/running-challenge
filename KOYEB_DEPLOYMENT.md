# Koyeb + Supabase 무료 배포 가이드

완전 무료로 Running Challenge 앱을 배포하는 방법입니다.

## 📋 개요

- **Koyeb**: 앱 호스팅 (무료)
- **Supabase**: PostgreSQL 데이터베이스 (무료 500MB)
- **총 비용**: 0원 영구 사용 가능!

---

## 1단계: Supabase에서 PostgreSQL 생성

### 1.1 Supabase 계정 생성

1. https://supabase.com 접속
2. **Start your project** 클릭
3. GitHub 계정으로 로그인

### 1.2 프로젝트 생성

1. **New project** 클릭
2. 다음 정보 입력:
   ```
   Name: running-challenge
   Database Password: 강력한 비밀번호 (복사해두기!)
   Region: Northeast Asia (Seoul) - 한국 가장 가까움
   Pricing Plan: Free
   ```
3. **Create new project** 클릭
4. 프로젝트 생성 대기 (약 2분)

### 1.3 DATABASE_URL 가져오기

1. 프로젝트 대시보드에서 **Settings** (톱니바퀴) 클릭
2. **Database** 클릭
3. **Connection string** 섹션에서 **URI** 선택
4. Connection string 복사:
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
   ```
5. `[YOUR-PASSWORD]`를 실제 비밀번호로 교체
6. 안전한 곳에 저장!

---

## 2단계: 로컬에서 Supabase로 데이터 마이그레이션

### 2.1 환경변수 설정

터미널에서 실행:

```bash
cd ~/running-challenge

# Supabase DATABASE_URL 설정
export DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

# 확인
echo $DATABASE_URL
```

### 2.2 마이그레이션 실행

```bash
# 기존 SQLite 데이터를 Supabase PostgreSQL로 이동
node migrate-to-postgres.js

# 성공 메시지 확인:
# 🎉 마이그레이션 완료!
```

### 2.3 마이그레이션 확인

Supabase 대시보드에서:
1. **Table Editor** 클릭
2. `users`, `activities`, `competitions` 테이블 확인
3. 데이터가 잘 들어갔는지 확인

---

## 3단계: GitHub에 코드 푸시

### 3.1 GitHub 저장소 확인

```bash
# 원격 저장소 확인
git remote -v

# 없으면 GitHub에서 저장소 생성 후:
# gh repo create running-challenge --public --source=. --remote=origin --push
```

### 3.2 코드 푸시

```bash
# 변경사항 추가
git add .

# 커밋
git commit -m "Switch to PostgreSQL for Koyeb deployment

- Migrate from SQLite to PostgreSQL
- Add Koyeb deployment configuration
- Update environment variables

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 푸시
git push origin main
```

---

## 4단계: Koyeb 배포

### 4.1 Koyeb 계정 생성

1. https://www.koyeb.com 접속
2. **Sign up** 클릭
3. GitHub 계정으로 로그인

### 4.2 앱 생성

1. **Create App** 클릭
2. **GitHub** 선택
3. GitHub 저장소 연결:
   - **Install Koyeb** 클릭하여 GitHub 앱 설치
   - 저장소 선택: `running-challenge`

### 4.3 배포 설정

**Builder** 섹션:
```
Build method: Buildpack (자동 감지)
Build command: npm install && npm run build:css
Run command: npm start
```

**Environment variables** 섹션에서 **Add variable** 클릭하여 추가:

```
NODE_ENV=production

DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres

ADMIN_PASSWORD=your_admin_password

STRAVA_CLIENT_ID=179292
STRAVA_CLIENT_SECRET=6a08c95080328a6ecbc464ddc4a5bf233a0b1649
STRAVA_REDIRECT_URI=https://your-app-name.koyeb.app/auth/strava/callback
```

**주의**: `STRAVA_REDIRECT_URI`의 `your-app-name`은 Koyeb가 자동으로 생성하는 도메인입니다. 일단 임시로 입력하고 나중에 수정합니다.

**Instance** 섹션:
```
Region: Washington D.C. (fra) - 무료 리전
Instance type: Free (무료)
```

**App name**: `running-challenge` (또는 원하는 이름)

### 4.4 배포 시작

1. **Deploy** 클릭
2. 배포 대기 (약 3-5분)
3. 배포 완료되면 URL 확인:
   ```
   https://running-challenge-your-org.koyeb.app
   ```

---

## 5단계: Strava OAuth 설정 업데이트

### 5.1 Koyeb 앱 URL 확인

Koyeb 대시보드에서:
1. 배포된 앱 클릭
2. **Domains** 탭에서 URL 복사
   ```
   예: https://running-challenge-songtech.koyeb.app
   ```

### 5.2 Strava API 설정 변경

1. https://www.strava.com/settings/api 접속
2. 기존 앱 선택
3. **Authorization Callback Domain** 수정:
   ```
   변경 전: localhost
   변경 후: running-challenge-songtech.koyeb.app
   ```
4. **Update** 클릭

### 5.3 Koyeb 환경변수 업데이트

Koyeb 대시보드에서:
1. 앱 클릭 → **Settings** → **Environment variables**
2. `STRAVA_REDIRECT_URI` 수정:
   ```
   https://running-challenge-songtech.koyeb.app/auth/strava/callback
   ```
3. **Save** 클릭
4. 자동 재배포됨 (1-2분 소요)

---

## 6단계: 테스트

### 6.1 앱 접속

브라우저에서 Koyeb URL 접속:
```
https://running-challenge-songtech.koyeb.app
```

### 6.2 Strava 연동 테스트

1. **Strava 연동** 버튼 클릭
2. Strava 로그인
3. 권한 허용
4. 리다이렉트 확인
5. 데이터 동기화 테스트

### 6.3 데이터 확인

- 사용자 목록 확인
- 활동 기록 확인
- 대회 정보 확인

---

## 🎉 완료!

이제 완전 무료로 앱이 실행됩니다!

```
✅ Koyeb: 무료 호스팅
✅ Supabase: 무료 PostgreSQL (500MB)
✅ 24/7 실행
✅ 자동 배포 (GitHub 푸시만 하면 됨)
✅ 데이터 영속성 보장
```

---

## 🔧 유지보수

### 코드 업데이트

```bash
# 코드 수정 후
git add .
git commit -m "Update features"
git push origin main

# Koyeb가 자동으로 재배포
```

### 데이터베이스 백업

Supabase 대시보드에서:
1. **Database** → **Backups**
2. 자동 백업 활성화됨 (무료 플랜 7일)
3. 수동 백업도 가능

### 로그 확인

Koyeb 대시보드에서:
1. 앱 클릭 → **Logs**
2. 실시간 로그 확인

---

## 🚨 문제 해결

### 앱이 시작되지 않는 경우

1. Koyeb **Logs** 확인
2. 환경변수 확인 (DATABASE_URL 등)
3. Build 로그 확인

### 데이터베이스 연결 오류

1. Supabase DATABASE_URL 확인
2. 비밀번호 올바른지 확인
3. Supabase 프로젝트 "paused" 상태 아닌지 확인

### Strava OAuth 오류

1. Callback URL 정확한지 확인
2. Strava API 설정 확인
3. HTTPS 사용 중인지 확인 (Koyeb는 자동 HTTPS)

---

## 📊 무료 플랜 제한

### Koyeb Free
- 1개 앱
- 512MB RAM
- 0.1 vCPU
- 충분히 사용 가능!

### Supabase Free
- 500MB 데이터베이스
- 무제한 API 요청
- 1주일 자동 백업
- 소규모 앱에 충분!

**제한 초과 시**:
- Koyeb: 앱이 느려질 수 있음 (보통 문제 없음)
- Supabase: 500MB 초과 시 업그레이드 필요 ($25/월)

---

## 💡 팁

1. **Custom Domain** (선택사항)
   - Koyeb에서 무료로 커스텀 도메인 연결 가능
   - 도메인만 별도 구매 필요

2. **모니터링**
   - Supabase에서 DB 사용량 확인
   - Koyeb에서 앱 상태 모니터링

3. **보안**
   - 환경변수에 비밀번호 안전하게 보관
   - Supabase Row Level Security (RLS) 설정 고려

완전 무료로 친구들과 즐기세요! 🎉
