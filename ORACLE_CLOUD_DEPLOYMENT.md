# Oracle Cloud Free Tier 배포 가이드

이 가이드는 Running Challenge 앱을 Oracle Cloud Free Tier에 배포하는 전체 과정을 안내합니다.

## 목차
1. [Oracle Cloud VM 설정](#1-oracle-cloud-vm-설정)
2. [PostgreSQL 설치 및 설정](#2-postgresql-설치-및-설정)
3. [애플리케이션 배포](#3-애플리케이션-배포)
4. [Nginx 및 SSL 설정](#4-nginx-및-ssl-설정)
5. [데이터 마이그레이션](#5-데이터-마이그레이션)
6. [Strava OAuth 설정 변경](#6-strava-oauth-설정-변경)

---

## 1. Oracle Cloud VM 설정

### 1.1 인스턴스 생성

1. Oracle Cloud 콘솔 접속 (https://cloud.oracle.com)
2. **Compute** → **Instances** → **Create Instance**
3. 다음과 같이 설정:

```
Name: running-challenge-server
Image: Canonical Ubuntu 22.04 (ARM64)
Shape: VM.Standard.A1.Flex
  - OCPU: 2
  - Memory: 12 GB
Boot Volume: 50 GB

Network:
  - VCN: 기본 VCN 또는 새로 생성
  - Subnet: Public Subnet
  - Public IP: Assign a public IPv4 address
```

4. SSH 키 다운로드 또는 기존 공개키 업로드
5. **Create** 클릭

### 1.2 방화벽 규칙 설정

**Security List 설정:**

1. **Networking** → **Virtual Cloud Networks** → 사용 중인 VCN 선택
2. **Security Lists** → Default Security List 선택
3. **Add Ingress Rules** 클릭하여 다음 규칙 추가:

```
Stateless: No
Source: 0.0.0.0/0
IP Protocol: TCP
Destination Port Range: 80

Stateless: No
Source: 0.0.0.0/0
IP Protocol: TCP
Destination Port Range: 443

Stateless: No
Source: 0.0.0.0/0
IP Protocol: TCP
Destination Port Range: 3000 (임시, 테스트용)
```

### 1.3 VM 접속

```bash
# SSH 키 권한 설정
chmod 400 ~/Downloads/ssh-key.key

# VM 접속
ssh -i ~/Downloads/ssh-key.key ubuntu@<VM_PUBLIC_IP>
```

### 1.4 VM 내부 방화벽 설정

```bash
# UFW 방화벽 설정
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Node.js (임시)
sudo ufw enable
sudo ufw status
```

---

## 2. PostgreSQL 설치 및 설정

### 2.1 PostgreSQL 설치

```bash
# 패키지 업데이트
sudo apt update && sudo apt upgrade -y

# PostgreSQL 설치
sudo apt install postgresql postgresql-contrib -y

# 서비스 시작
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 버전 확인
psql --version
```

### 2.2 데이터베이스 및 사용자 생성

```bash
# PostgreSQL 사용자로 전환
sudo -u postgres psql

# 다음 SQL 명령어 실행:
CREATE DATABASE running_challenge;
CREATE USER runapp WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE running_challenge TO runapp;

# PostgreSQL 15+ 추가 권한 설정
\c running_challenge
GRANT ALL ON SCHEMA public TO runapp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO runapp;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO runapp;

# 종료
\q
```

### 2.3 PostgreSQL 외부 접속 허용 (선택사항)

로컬에서 데이터베이스 관리 도구로 접속하려면:

```bash
# postgresql.conf 수정
sudo nano /etc/postgresql/14/main/postgresql.conf

# 다음 라인 찾아서 수정:
listen_addresses = '*'

# pg_hba.conf 수정
sudo nano /etc/postgresql/14/main/pg_hba.conf

# 다음 라인 추가:
host    all             all             0.0.0.0/0               md5

# PostgreSQL 재시작
sudo systemctl restart postgresql
```

---

## 3. 애플리케이션 배포

### 3.1 Node.js 설치

```bash
# Node.js 20.x 설치 (ARM64)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 버전 확인
node --version
npm --version
```

### 3.2 Git 및 프로젝트 클론

```bash
# Git 설치
sudo apt install git -y

# 프로젝트 디렉토리 생성
mkdir -p ~/apps
cd ~/apps

# 프로젝트 클론
git clone <YOUR_GITHUB_REPO_URL> running-challenge
cd running-challenge

# 의존성 설치
npm install

# CSS 빌드 (Tailwind)
npm run build:css
```

### 3.3 환경변수 설정

```bash
# .env 파일 생성
cp .env.example .env
nano .env

# 다음 내용으로 수정:
PORT=3000
NODE_ENV=production

ADMIN_PASSWORD=your_admin_password

DATABASE_URL=postgresql://runapp:your_secure_password_here@localhost:5432/running_challenge

STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
STRAVA_REDIRECT_URI=https://your-domain.com/auth/strava/callback
```

### 3.4 PM2 설치 및 앱 실행

```bash
# PM2 전역 설치
sudo npm install -g pm2

# 앱 시작
pm2 start server.js --name running-app

# 부팅 시 자동 시작 설정
pm2 startup
# 출력된 명령어 복사해서 실행 (sudo systemctl enable pm2-ubuntu)

# 현재 프로세스 목록 저장
pm2 save

# 상태 확인
pm2 status
pm2 logs running-app
```

---

## 4. Nginx 및 SSL 설정

### 4.1 Nginx 설치

```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 4.2 Nginx 설정

```bash
# 설정 파일 생성
sudo nano /etc/nginx/sites-available/running-app

# 다음 내용 입력:
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/running-app /etc/nginx/sites-enabled/

# 기본 설정 제거
sudo rm /etc/nginx/sites-enabled/default

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

### 4.3 도메인 설정

1. 도메인 등록 (Cloudflare, GoDaddy, Gabia 등)
2. DNS A 레코드 설정:
   ```
   Type: A
   Name: @
   Value: <VM_PUBLIC_IP>
   TTL: Auto

   Type: A
   Name: www
   Value: <VM_PUBLIC_IP>
   TTL: Auto
   ```

3. DNS 전파 확인 (5분~24시간 소요):
   ```bash
   nslookup your-domain.com
   ```

### 4.4 SSL 인증서 설치 (Let's Encrypt)

```bash
# Certbot 설치
sudo apt install certbot python3-certbot-nginx -y

# SSL 인증서 발급
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 이메일 입력 및 약관 동의
# "Redirect HTTP to HTTPS" 선택 → 2번

# 자동 갱신 테스트
sudo certbot renew --dry-run

# 인증서는 90일마다 자동 갱신됨
```

---

## 5. 데이터 마이그레이션

### 5.1 Railway에서 SQLite 백업 (로컬에서 실행)

Railway에 접속하여 SQLite DB 파일 다운로드:

```bash
# Railway CLI 사용하는 경우
railway run cat running.db > running.db.backup

# 또는 Railway 대시보드에서 파일 다운로드
```

### 5.2 백업 파일 Oracle Cloud로 업로드

```bash
# 로컬에서 실행
scp -i ~/Downloads/ssh-key.key running.db.backup ubuntu@<VM_PUBLIC_IP>:~/apps/running-challenge/
```

### 5.3 마이그레이션 실행

```bash
# VM에서 실행
cd ~/apps/running-challenge

# 환경변수 확인
cat .env | grep DATABASE_URL

# SQLite DB 경로 지정 (필요 시)
export SQLITE_DB_PATH=~/apps/running-challenge/running.db.backup

# 마이그레이션 실행
node migrate-to-postgres.js

# 성공 메시지 확인:
# 🎉 마이그레이션 완료!
```

### 5.4 앱 재시작

```bash
pm2 restart running-app
pm2 logs running-app
```

---

## 6. Strava OAuth 설정 변경

### 6.1 Strava API 설정 업데이트

1. https://www.strava.com/settings/api 접속
2. 기존 앱 선택
3. **Authorization Callback Domain** 변경:
   ```
   기존: your-app.up.railway.app
   새로: your-domain.com
   ```

4. **Update** 클릭

### 6.2 .env 파일 확인 및 재시작

```bash
# .env 파일에서 STRAVA_REDIRECT_URI 확인
cat .env | grep STRAVA_REDIRECT_URI

# 올바르면 앱 재시작
pm2 restart running-app
```

---

## 7. 유지보수 및 모니터링

### 7.1 로그 확인

```bash
# PM2 로그
pm2 logs running-app

# Nginx 로그
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# PostgreSQL 로그
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### 7.2 업데이트 배포

```bash
cd ~/apps/running-challenge

# 최신 코드 가져오기
git pull origin main

# 의존성 업데이트 (필요 시)
npm install

# CSS 재빌드 (필요 시)
npm run build:css

# 앱 재시작
pm2 restart running-app
```

### 7.3 데이터베이스 백업

```bash
# PostgreSQL 백업 스크립트 생성
nano ~/backup-db.sh

# 다음 내용 입력:
#!/bin/bash
BACKUP_DIR=~/backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U runapp running_challenge > $BACKUP_DIR/running_challenge_$DATE.sql

# 실행 권한 부여
chmod +x ~/backup-db.sh

# 백업 실행
~/backup-db.sh

# Cron으로 매일 자동 백업 (선택사항)
crontab -e
# 다음 라인 추가 (매일 새벽 3시):
0 3 * * * ~/backup-db.sh
```

### 7.4 시스템 모니터링

```bash
# 디스크 사용량
df -h

# 메모리 사용량
free -h

# 프로세스 상태
pm2 monit

# PostgreSQL 연결 수
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## 8. 문제 해결

### 8.1 앱이 시작되지 않는 경우

```bash
# 로그 확인
pm2 logs running-app --lines 100

# 환경변수 확인
pm2 env 0

# 포트 사용 확인
sudo lsof -i :3000

# 수동 실행 테스트
node server.js
```

### 8.2 데이터베이스 연결 오류

```bash
# PostgreSQL 서비스 상태 확인
sudo systemctl status postgresql

# 연결 테스트
psql -U runapp -d running_challenge -h localhost

# DATABASE_URL 형식 확인
echo $DATABASE_URL
```

### 8.3 Nginx 502 Bad Gateway

```bash
# Node.js 앱 상태 확인
pm2 status

# Nginx 설정 확인
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

### 8.4 SSL 인증서 갱신 실패

```bash
# 수동 갱신 시도
sudo certbot renew --force-renewal

# Nginx 정지 후 재시도
sudo systemctl stop nginx
sudo certbot renew
sudo systemctl start nginx
```

---

## 9. 보안 권장사항

### 9.1 SSH 보안 강화

```bash
# SSH 설정 파일 수정
sudo nano /etc/ssh/sshd_config

# 다음 설정 변경:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes

# SSH 재시작
sudo systemctl restart sshd
```

### 9.2 Fail2Ban 설치 (무차별 대입 공격 방지)

```bash
sudo apt install fail2ban -y
sudo systemctl start fail2ban
sudo systemctl enable fail2ban
```

### 9.3 정기 업데이트

```bash
# 시스템 패키지 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 패키지 업데이트
cd ~/apps/running-challenge
npm outdated
npm update
```

---

## 완료!

이제 Running Challenge 앱이 Oracle Cloud Free Tier에서 안전하게 실행됩니다.

접속 URL: `https://your-domain.com`

문제가 발생하면 위의 문제 해결 섹션을 참고하세요.
