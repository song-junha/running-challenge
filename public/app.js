// 관리자 설정
const ADMIN_STRAVA_ID = '25163546';

// 현재 선택된 기간
let currentPeriod = 'thisMonth';
let currentUserId = null;
let currentUser = null; // 현재 로그인한 사용자 정보 (strava_id 포함)
let competitionFilter = 'future'; // 대회 필터 상태
let competitionsCache = []; // 대회 데이터 캐시
let competitionSearchQuery = ''; // 대회 검색어


// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  checkConnectionStatus();
  loadStats();
  loadActivities();
  setupPeriodSelector();
  setupStravaButtons();
  setupNavigation();
  loadCompetitions();
  loadUsers();
  initChallenges();
});

// 기간 선택 버튼 설정
function setupPeriodSelector() {
  const buttons = document.querySelectorAll('.btn-group button');
  buttons.forEach(button => {
    button.addEventListener('click', () => {
      // 활성 버튼 변경 (DaisyUI)
      buttons.forEach(b => b.classList.remove('btn-active'));
      button.classList.add('btn-active');

      // 기간 업데이트 및 데이터 다시 로드
      currentPeriod = button.dataset.period;
      loadStats();
    });
  });
}

// 기간별 날짜 계산
function getDateRangeForPeriod(period) {
  const now = new Date();
  let startDate, endDate;

  switch(period) {
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
      break;
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'thisYear':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
      break;
    case 'lastYear':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString()
  };
}

// 통계 데이터 로드
async function loadStats() {
  const statsContainer = document.getElementById('stats');
  statsContainer.innerHTML = '<div class="col-span-full flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>';

  try {
    const dateRange = getDateRangeForPeriod(currentPeriod);
    const response = await fetch(`/api/stats?start=${dateRange.start}&end=${dateRange.end}`);
    const stats = await response.json();

    if (stats.length === 0) {
      statsContainer.innerHTML = `
        <div class="col-span-full">
          <div class="alert alert-info shadow-lg">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <div>
                <h3 class="font-bold">😴 아직 기록이 없습니다</h3>
                <div class="text-xs">Strava를 연동하고 러닝을 시작해보세요!</div>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // 전체 사용자 리스트 (1 row per user)
    const allUsersList = stats.map((user, index) => {
      const distance = (user.total_distance / 1000).toFixed(1);
      const time = formatTime(user.total_time);
      const avgPace = calculatePace(user.total_distance, user.total_time);
      const rankBadge = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}`;

      return `
        <tr class="hover cursor-pointer" onclick="showPersonalRecords(${user.id}, '${user.name || '사용자'}')">
          <td class="font-bold text-xs">${rankBadge}</td>
          <td class="font-semibold text-xs">${user.name || '사용자'}</td>
          <td><span class="badge badge-primary badge-sm">${distance}km</span></td>
          <td class="text-xs">${time}</td>
          <td class="text-xs">${avgPace}</td>
        </tr>
      `;
    }).join('');

    statsContainer.innerHTML = `
      <!-- All Users Table -->
      <div class="col-span-full">
        <div class="card bg-base-100 shadow-md">
          <div class="card-body p-3">
            <h2 class="card-title text-lg mb-2">📊 전체 순위</h2>
            <div class="overflow-x-auto -mx-3">
              <table class="table table-zebra table-xs">
                <thead>
                  <tr>
                    <th class="text-xs">순위</th>
                    <th class="text-xs">이름</th>
                    <th class="text-xs">거리</th>
                    <th class="text-xs">시간</th>
                    <th class="text-xs">페이스</th>
                  </tr>
                </thead>
                <tbody>
                  ${allUsersList}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('통계 로드 실패:', error);
    statsContainer.innerHTML = `
      <div class="col-span-full">
        <div class="alert alert-error shadow-lg">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>통계를 불러올 수 없습니다</span>
          </div>
        </div>
      </div>
    `;
  }
}

// 최근 활동 로드 (사용자별 최근 30개, 전체 최신 200개)
async function loadActivities() {
  const activitiesContainer = document.getElementById('activities');
  activitiesContainer.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-dots loading-lg text-primary"></span></div>';

  try {
    const response = await fetch('/api/activities/recent');
    const activities = await response.json();

    if (activities.length === 0) {
      activitiesContainer.innerHTML = `
        <div class="alert alert-info shadow-lg">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
              <h3 class="font-bold">😴 아직 활동이 없습니다</h3>
              <div class="text-xs">첫 러닝을 시작해보세요!</div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // 활동 목록 생성
    activitiesContainer.innerHTML = activities.map(activity => {
      const distance = (activity.distance / 1000).toFixed(2);
      const time = formatTime(activity.moving_time);
      const pace = calculatePace(activity.distance, activity.moving_time);
      const dateObj = new Date(activity.start_date);
      const date = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;

      return `
        <div style="
          padding: 10px 12px;
          border-radius: 8px;
          border-left: 3px solid #FF6B6B;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          background: white;
          margin-bottom: 6px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        "
        onclick="openActivityDetail('${activity.activity_id}')"
        onmouseenter="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.15)'"
        onmouseleave="this.style.transform='scale(1)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.08)'"
        >
          <!-- 헤더 영역 -->
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          ">
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
            ">
              <span>🔥</span>
              <span style="
                font-size: 15px;
                font-weight: 600;
                color: #333;
              ">${activity.name || '러닝'} • ${activity.user_name}</span>
            </div>
            <div style="
              font-size: 12px;
              color: #999;
            ">${date}</div>
          </div>

          <!-- 통계 영역 -->
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          ">
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: #333;">${distance} km</div>
              <div style="font-size: 10px; color: #999;">거리</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: #333;">${time}</div>
              <div style="font-size: 10px; color: #999;">시간</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: #333;">${pace}</div>
              <div style="font-size: 10px; color: #999;">페이스</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: #333;">${Math.round(activity.total_elevation_gain || 0)}m</div>
              <div style="font-size: 10px; color: #999;">고도</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('활동 로드 실패:', error);
    activitiesContainer.innerHTML = `
      <div class="alert alert-error shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>활동을 불러올 수 없습니다</span>
        </div>
      </div>
    `;
  }
}

// 시간 포맷팅 (초 -> 시:분:초)
function formatTime(seconds, includeSeconds = false) {
  if (!seconds) return '0분';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    if (includeSeconds) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${hours}시간 ${minutes}분`;
  } else if (minutes > 0) {
    if (includeSeconds) {
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}분`;
  } else {
    return `${secs}초`;
  }
}

// 페이스 계산 (분/km)
function calculatePace(distance, time) {
  if (!distance || !time) return '-';

  const distanceKm = distance / 1000;
  const totalSeconds = time / distanceKm;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);

  // 60초가 되면 분으로 올림
  if (seconds === 60) {
    return `${minutes + 1}'00"`;
  }

  return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
}

// Strava 연동 상태 확인
async function checkConnectionStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const connected = urlParams.get('connected');
  const userId = urlParams.get('userId');
  const error = urlParams.get('error');
  const detail = urlParams.get('detail');

  if (connected && userId) {
    currentUserId = userId;
    localStorage.setItem('stravaUserId', userId);
    showMessage('Strava 연동 완료!', 'success');
    updateStravaButtons(true);
    // 사용자 정보 가져오기
    await loadCurrentUser();
    // URL 파라미터 제거
    window.history.replaceState({}, document.title, '/');
  } else if (error) {
    let errorMsg = 'Strava 연동 실패: ' + error;
    if (detail) {
      console.error('상세 에러:', detail);
      errorMsg += '\n\n상세 정보 (콘솔 확인): ' + detail;
    }
    showMessage(errorMsg, 'error');
    // URL 파라미터 제거
    window.history.replaceState({}, document.title, '/');
  } else {
    // 로컬 스토리지에서 사용자 ID 확인
    const storedUserId = localStorage.getItem('stravaUserId');
    if (storedUserId) {
      currentUserId = storedUserId;
      updateStravaButtons(true);
      // 사용자 정보 가져오기
      await loadCurrentUser();
    }
  }
}

// 현재 로그인한 사용자 정보 로드
async function loadCurrentUser() {
  if (!currentUserId) return;

  try {
    const response = await fetch(`/api/users/${currentUserId}`);
    if (response.ok) {
      currentUser = await response.json();
    }
  } catch (error) {
    console.error('사용자 정보 로드 실패:', error);
  }
}

// 관리자 체크
function isAdmin() {
  return currentUser && currentUser.strava_id === ADMIN_STRAVA_ID;
}

// 자신의 정보인지 체크
function isOwnProfile(userId) {
  return currentUserId && currentUserId == userId;
}

// Strava 버튼 설정
function setupStravaButtons() {
  const connectBtn = document.getElementById('stravaConnect');
  const syncBtn = document.getElementById('stravaSync');

  connectBtn.addEventListener('click', () => {
    window.location.href = '/auth/strava';
  });

  syncBtn.addEventListener('click', async () => {
    if (!currentUserId) {
      showMessage('먼저 Strava를 연동해주세요', 'error');
      return;
    }

    syncBtn.disabled = true;
    syncBtn.textContent = '동기화 중...';

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });

      const result = await response.json();

      if (result.success) {
        showMessage(result.message, 'success');
        // 데이터 새로고침
        loadStats();
        loadActivities();
      } else {
        showMessage('동기화 실패: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('동기화 오류:', error);
      showMessage('동기화 중 오류가 발생했습니다', 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.textContent = '데이터 동기화';
    }
  });
}

// 버튼 표시 업데이트
function updateStravaButtons(connected) {
  const connectBtn = document.getElementById('stravaConnect');
  const syncBtn = document.getElementById('stravaSync');

  if (connected) {
    connectBtn.classList.add('hidden');
    syncBtn.classList.remove('hidden');
  } else {
    connectBtn.classList.remove('hidden');
    syncBtn.classList.add('hidden');
  }
}

// 메시지 표시 (DaisyUI Toast)
function showMessage(message, type) {
  // 기존 메시지 제거
  const existingMessage = document.querySelector('.toast');
  if (existingMessage) {
    existingMessage.remove();
  }

  const alertClass = type === 'success' ? 'alert-success' : type === 'info' ? 'alert-info' : 'alert-error';
  const icon = type === 'success'
    ? '<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
    : type === 'info'
    ? '<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>';

  const toast = document.createElement('div');
  toast.className = 'toast toast-top toast-end z-50';
  toast.innerHTML = `
    <div class="alert ${alertClass} shadow-lg">
      <div>
        ${icon}
        <span>${message}</span>
      </div>
    </div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 개인 기록 팝업 표시
async function showPersonalRecords(userId, userName) {
  const modal = document.getElementById('recordsModal');
  const modalUserName = document.getElementById('modalUserName');
  const recordsContent = document.getElementById('recordsContent');

  modalUserName.textContent = `${userName} - 개인 기록`;
  recordsContent.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg text-primary"></span></div>';

  modal.showModal();

  try {
    const response = await fetch(`/api/users/${userId}/records`);
    const records = await response.json();

    const distances = ['5K', '10K', 'Half', 'Full'];
    const distanceLabels = {
      '5K': '5k',
      '10K': '10k',
      'Half': 'Half',
      'Full': 'Full'
    };

    recordsContent.innerHTML = `
      <div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>거리</th>
              <th>기록</th>
              <th>페이스</th>
              <th>날짜</th>
            </tr>
          </thead>
          <tbody>
            ${distances.map(dist => {
              const record = records[dist];

              if (!record) {
                return `
                  <tr>
                    <td class="font-semibold">${distanceLabels[dist]}</td>
                    <td colspan="3" class="text-base-content/60">기록 없음</td>
                  </tr>
                `;
              }

              const time = formatTime(record.moving_time, true);
              const pace = calculatePace(record.distance, record.moving_time);
              const dateObj = new Date(record.start_date);
              const date = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;

              return `
                <tr class="hover cursor-pointer" onclick="openActivityDetail('${record.activity_id}')" style="cursor: pointer;">
                  <td class="font-semibold text-sm">${distanceLabels[dist]}</td>
                  <td><span class="badge badge-primary">${time}</span></td>
                  <td class="text-sm">${pace}</td>
                  <td class="text-xs">${date}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

  } catch (error) {
    console.error('개인 기록 로드 실패:', error);
    recordsContent.innerHTML = `
      <div class="alert alert-error shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>개인 기록을 불러올 수 없습니다</span>
        </div>
      </div>
    `;
  }
}

// 네비게이션 설정
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPage = item.dataset.page;

      // 모든 네비게이션 아이템에서 active 제거 및 opacity 0.5로
      navItems.forEach(nav => {
        nav.classList.remove('active');
        nav.style.opacity = '0.5';
      });
      // 클릭된 아이템에 active 추가 및 opacity 1로
      item.classList.add('active');
      item.style.opacity = '1';

      // 모든 페이지 숨김
      pages.forEach(page => page.classList.add('hidden'));
      // 선택된 페이지만 표시
      document.getElementById(targetPage).classList.remove('hidden');

      // 페이지 맨 위로 스크롤
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// 대회 필터 변경
function filterCompetitions(filter) {
  competitionFilter = filter;

  // 버튼 활성화 상태 변경
  document.querySelectorAll('[data-filter]').forEach(btn => {
    if (btn.dataset.filter === filter) {
      btn.classList.add('btn-active');
    } else {
      btn.classList.remove('btn-active');
    }
  });

  // 헤더 텍스트 및 색상 변경
  const titleElement = document.getElementById('competitionFilterTitle');
  if (titleElement) {
    if (filter === 'future') {
      titleElement.textContent = '🔜 예정된 대회';
      titleElement.className = 'text-sm font-semibold text-primary whitespace-nowrap';
    } else if (filter === 'past') {
      titleElement.textContent = '📋 지난 대회';
      titleElement.className = 'text-sm font-semibold text-purple-500 whitespace-nowrap';
    }
  }

  // 캐시된 데이터로 렌더링
  renderCompetitions(competitionsCache);
}

// 대회 검색
function searchCompetitions(query) {
  competitionSearchQuery = query;
  renderCompetitions(competitionsCache);
}

// 대회 목록 로드
async function loadCompetitions() {
  const listContainer = document.getElementById('competitionList');
  listContainer.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-dots loading-lg text-primary"></span></div>';

  try {
    const response = await fetch('/api/competitions');
    const competitions = await response.json();

    // 캐시 저장
    competitionsCache = competitions;

    if (competitions.length === 0) {
      listContainer.innerHTML = `
        <div class="alert alert-info shadow-md">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>등록된 대회가 없습니다</span>
          </div>
        </div>
      `;
      return;
    }

    renderCompetitions(competitions);

  } catch (error) {
    console.error('대회 목록 로드 실패:', error);
    listContainer.innerHTML = `
      <div class="alert alert-error shadow-md">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>대회 목록을 불러올 수 없습니다</span>
        </div>
      </div>
    `;
  }
}

// 대회 목록 렌더링
function renderCompetitions(competitions) {
  const listContainer = document.getElementById('competitionList');

  // 오늘 날짜 (YYYY/MM/DD 형식)
  const today = new Date();
  const todayStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

  // 미래/과거 대회 분리
  const originalFutureCompetitions = competitions.filter(comp => comp.date >= todayStr);
  const originalPastCompetitions = competitions.filter(comp => comp.date < todayStr);

  let futureCompetitions = [...originalFutureCompetitions];
  let pastCompetitions = [...originalPastCompetitions];

  // 필터에 따라 표시할 대회 결정
  if (competitionFilter === 'future') {
    pastCompetitions = [];
  } else if (competitionFilter === 'past') {
    futureCompetitions = [];
  }

  // 검색어 필터링 (대회명 또는 참가자 이름)
  if (competitionSearchQuery) {
    const query = competitionSearchQuery.toLowerCase();
    futureCompetitions = futureCompetitions.filter(comp =>
      comp.name.toLowerCase().includes(query) ||
      comp.participants.some(p => p.name.toLowerCase().includes(query))
    );
    pastCompetitions = pastCompetitions.filter(comp =>
      comp.name.toLowerCase().includes(query) ||
      comp.participants.some(p => p.name.toLowerCase().includes(query))
    );
  }

  // 대회 카드 생성 함수
  const createCompetitionCard = (comp) => `
      <div class="competition-card card bg-base-100 shadow-md border border-base-300"
           data-competition-id="${comp.id}"
           onclick="selectCompetition(${comp.id})"
           style="cursor: pointer; transition: all 0.2s;">
        <div class="card-body p-4">
          <!-- 대회 정보 -->
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 1px solid #e5e5e5;
          ">
            <div>
              <div style="font-size: 11px; color: #999; margin-bottom: 4px;">${comp.date}</div>
              <div style="font-size: 16px; font-weight: 600; color: #333;">${comp.name}</div>
            </div>
            ${currentUser && comp.participants.some(p => p.strava_id === currentUser.strava_id)
              ? `<button class="btn btn-error btn-sm" onclick="event.stopPropagation(); leaveCompetition(${comp.id})">참가취소</button>`
              : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); joinCompetition(${comp.id})">참가</button>`
            }
          </div>

          <!-- 참가자 리스트 -->
          <div style="margin-top: 12px;">
            <div style="font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px;">
              참가자 (${comp.participants.length}명)
            </div>
            <div class="overflow-x-auto">
              <table class="table table-xs">
                <thead>
                  <tr>
                    <th class="text-xs">이름</th>
                    <th class="text-xs">종목</th>
                    <th class="text-xs">결과</th>
                  </tr>
                </thead>
                <tbody>
                  ${comp.participants.map((p) => {
                    const hasActivityId = p.activity_id && p.activity_id !== '-';
                    const resultText = p.result || '-';
                    return `
                    <tr>
                      <td class="text-xs font-semibold">${p.name}</td>
                      <td class="text-xs">${p.category}</td>
                      <td class="text-xs ${hasActivityId ? 'text-primary font-semibold cursor-pointer hover:underline' : 'text-base-content/60'}"
                          ${hasActivityId ? `onclick="event.stopPropagation(); openActivityDetail('${p.activity_id}')"` : ''}
                          ${hasActivityId ? 'style="cursor: pointer;"' : ''}>
                        ${resultText}
                      </td>
                    </tr>
                  `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    // HTML 생성
    let html = '';

    // 미래 대회 섹션 (원본 데이터가 있으면 섹션 표시)
    if (competitionFilter === 'future' && originalFutureCompetitions.length > 0) {
      html += `
        <div class="mb-4">
          ${futureCompetitions.length > 0 ? `
            <div class="space-y-3">
              ${futureCompetitions.map(createCompetitionCard).join('')}
            </div>
          ` : `
            <div class="alert alert-warning shadow-md">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>검색 결과가 없습니다</span>
              </div>
            </div>
          `}
        </div>
      `;
    }

  // 과거 대회 섹션
  if (competitionFilter === 'past' && originalPastCompetitions.length > 0) {
    html += `
      <div class="${originalFutureCompetitions.length > 0 ? 'mt-6' : ''}">
        ${pastCompetitions.length > 0 ? `
          <div class="space-y-3">
            ${pastCompetitions.map(createCompetitionCard).join('')}
          </div>
        ` : `
          <div class="alert alert-warning shadow-md">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>검색 결과가 없습니다</span>
            </div>
          </div>
        `}
      </div>
    `;
  }

  // 대회가 없는 경우 메시지 표시 (원본 데이터 기준)
  if (originalFutureCompetitions.length === 0 && originalPastCompetitions.length === 0) {
    const filterMessages = {
      'future': '예정된 대회가 없습니다',
      'past': '지난 대회가 없습니다'
    };
    html = `
      <div class="alert alert-info shadow-md">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>${filterMessages[competitionFilter]}</span>
        </div>
      </div>
    `;
  }

  listContainer.innerHTML = html;
}

// 대회 모달 열기
async function openCompetitionModal(mode, competitionId = null) {
  const modal = document.getElementById('competitionModal');
  const title = document.getElementById('competitionModalTitle');

  // 수정 모드인 경우 선택된 대회 확인
  if (mode === 'edit' && !selectedCompetitionId) {
    showMessage('수정할 대회를 선택해주세요', 'error');
    return;
  }

  // 모달 제목 설정
  title.textContent = mode === 'create' ? '대회 등록' : '대회 수정';
  currentEditingCompetitionId = mode === 'edit' ? selectedCompetitionId : null;

  // 참가자 섹션 표시 여부 (관리자만)
  const participantsSection = document.getElementById('participantsSection');
  if (isAdmin()) {
    participantsSection.style.display = 'block';
  } else {
    participantsSection.style.display = 'none';
  }

  // 폼 초기화
  document.getElementById('compDate').value = '';
  document.getElementById('compName').value = '';
  document.getElementById('participantsList').innerHTML = '';

  // 날짜 표시 초기화
  const dateDisplay = document.getElementById('dateDisplay');
  dateDisplay.textContent = '날짜를 선택하세요';
  dateDisplay.classList.add('text-base-content/50');
  dateDisplay.classList.remove('text-base-content');

  // 수정 모드인 경우 데이터 로드
  if (mode === 'edit' && selectedCompetitionId) {
    try {
      const response = await fetch('/api/competitions');
      const competitions = await response.json();
      const competition = competitions.find(c => c.id === selectedCompetitionId);

      if (!competition) {
        showMessage('대회를 찾을 수 없습니다', 'error');
        return;
      }

      // 폼에 데이터 채우기
      // 날짜 형식 변환 (YYYY/MM/DD -> YYYY-MM-DD for date input)
      const dateForInput = competition.date.replace(/\//g, '-');
      document.getElementById('compDate').value = dateForInput;
      document.getElementById('compName').value = competition.name;

      // 날짜 표시 업데이트
      const dateParts = competition.date.split('/');
      dateDisplay.textContent = `${dateParts[0]}. ${dateParts[1]}. ${dateParts[2]}.`;
      dateDisplay.classList.remove('text-base-content/50');
      dateDisplay.classList.add('text-base-content');

      // 참가자 목록 채우기
      const participantsList = document.getElementById('participantsList');
      competition.participants.forEach(participant => {
        addParticipantInput(participant.name, participant.category, participant.strava_id, participant.result, participant.activity_id);
      });
    } catch (error) {
      console.error('대회 데이터 로드 오류:', error);
      showMessage('대회 정보를 불러올 수 없습니다', 'error');
      return;
    }
  }

  modal.showModal();
}

// 대회 모달 닫기
function closeCompetitionModal() {
  document.getElementById('competitionModal').close();
  currentEditingCompetitionId = null;
}

// 날짜 표시 업데이트 (yyyy. mm. dd. 형식)
function updateDateDisplay() {
  const dateInput = document.getElementById('compDate');
  const dateDisplay = document.getElementById('dateDisplay');

  if (dateInput.value) {
    const date = new Date(dateInput.value + 'T00:00:00');
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    dateDisplay.textContent = `${year}. ${month}. ${day}.`;
    dateDisplay.classList.remove('text-base-content/50');
    dateDisplay.classList.add('text-base-content');
  } else {
    dateDisplay.textContent = '날짜를 선택하세요';
    dateDisplay.classList.add('text-base-content/50');
    dateDisplay.classList.remove('text-base-content');
  }
}

// 참가자 입력 필드 추가 (관리자 전용 - 등록된 사용자만 선택 가능)
async function addParticipantInput(name = '', category = '5K', stravaId = null, result = '', activityId = '') {
  const container = document.getElementById('participantsList');
  const index = container.children.length;

  // 등록된 사용자 목록 가져오기
  let users = [];
  try {
    const response = await fetch('/api/users');
    users = await response.json();
  } catch (error) {
    console.error('사용자 목록 로드 실패:', error);
    showMessage('사용자 목록을 불러올 수 없습니다', 'error');
    return;
  }

  const participantDiv = document.createElement('div');
  participantDiv.className = 'flex gap-2 items-center';
  if (stravaId) {
    participantDiv.setAttribute('data-strava-id', stravaId);
  }

  // 사용자 드롭다운 옵션 생성
  const userOptions = users.map(user => {
    const displayName = user.nickname || user.name;
    const isSelected = user.strava_id === stravaId || displayName === name;
    return `<option value="${user.strava_id}" ${isSelected ? 'selected' : ''}>${displayName}</option>`;
  }).join('');

  participantDiv.innerHTML = `
    <select
      class="select select-bordered flex-1"
      style="height: 40px; font-size: 14px;"
      id="pUser${index}"
      onchange="updateParticipantStravaId(${index})"
    >
      <option value="">참가자 선택</option>
      ${userOptions}
    </select>
    <select
      class="select select-bordered"
      style="height: 40px; width: 80px; font-size: 14px;"
      id="pCategory${index}"
    >
      <option value="5K" ${category === '5K' ? 'selected' : ''}>5K</option>
      <option value="10K" ${category === '10K' ? 'selected' : ''}>10K</option>
      <option value="Half" ${category === 'Half' ? 'selected' : ''}>Half</option>
      <option value="32K" ${category === '32K' ? 'selected' : ''}>32K</option>
      <option value="Full" ${category === 'Full' ? 'selected' : ''}>Full</option>
    </select>
    <input
      type="text"
      class="input input-bordered"
      style="height: 40px; width: 80px; font-size: 14px;"
      id="pResult${index}"
      placeholder="기록"
      value="${result}"
    />
    <input
      type="text"
      class="input input-bordered"
      style="height: 40px; width: 100px; font-size: 14px;"
      id="pActivityId${index}"
      placeholder="Activity ID"
      value="${activityId}"
    />
    <button type="button" class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

  container.appendChild(participantDiv);
}

// 참가자 선택 시 strava_id 업데이트
function updateParticipantStravaId(index) {
  const userSelect = document.getElementById(`pUser${index}`);
  const participantDiv = userSelect.closest('.flex');

  if (userSelect.value) {
    participantDiv.setAttribute('data-strava-id', userSelect.value);
  } else {
    participantDiv.removeAttribute('data-strava-id');
  }
}

// 대회 저장
async function saveCompetition() {
  const date = document.getElementById('compDate').value;
  const name = document.getElementById('compName').value;

  if (!date || !name) {
    showMessage('날짜와 대회명을 입력해주세요', 'error');
    return;
  }

  // 참가자 목록 수집
  const participants = [];
  const participantsList = document.getElementById('participantsList');

  for (let i = 0; i < participantsList.children.length; i++) {
    const participantDiv = participantsList.children[i];
    const userSelect = document.getElementById(`pUser${i}`);
    const categoryInput = document.getElementById(`pCategory${i}`);
    const resultInput = document.getElementById(`pResult${i}`);
    const activityIdInput = document.getElementById(`pActivityId${i}`);

    if (userSelect && userSelect.value) {
      // 선택된 사용자의 이름 가져오기
      const selectedOption = userSelect.options[userSelect.selectedIndex];
      const userName = selectedOption.text;

      const participant = {
        name: userName,
        category: categoryInput.value,
        strava_id: userSelect.value,
        result: resultInput.value || null,
        activity_id: activityIdInput.value || null
      };

      participants.push(participant);
    }
  }

  // 날짜 형식 변환 (YYYY-MM-DD -> YYYY/MM/DD)
  const formattedDate = date.replace(/-/g, '/');

  try {
    let response;
    if (currentEditingCompetitionId) {
      // 수정 모드 - 비밀번호 필요
      const password = prompt('관리자 비밀번호를 입력하세요:');
      if (!password) {
        showMessage('비밀번호를 입력해야 합니다', 'error');
        return;
      }

      response = await fetch(`/api/competitions/${currentEditingCompetitionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formattedDate,
          name: name,
          participants: participants,
          password: password
        })
      });
    } else {
      // 등록 모드 - 비밀번호 불필요
      response = await fetch('/api/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formattedDate,
          name: name,
          participants: participants
        })
      });
    }

    const result = await response.json();

    if (result.success) {
      showMessage(currentEditingCompetitionId ? '대회가 수정되었습니다' : '대회가 등록되었습니다', 'success');
      closeCompetitionModal();
      loadCompetitions(); // 목록 새로고침
    } else {
      showMessage('대회 저장 실패: ' + (result.error || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('대회 저장 오류:', error);
    showMessage('대회 저장 중 오류가 발생했습니다', 'error');
  }
}

// 대회 삭제
async function deleteCompetition() {
  if (!selectedCompetitionId) {
    showMessage('삭제할 대회를 선택해주세요', 'error');
    return;
  }

  if (!confirm('정말 이 대회를 삭제하시겠습니까?')) {
    return;
  }

  // 관리자 비밀번호 입력
  const password = prompt('관리자 비밀번호를 입력하세요:');
  if (!password) {
    showMessage('비밀번호를 입력해야 합니다', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/competitions/${selectedCompetitionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    });

    const result = await response.json();

    if (result.success) {
      showMessage('대회가 삭제되었습니다', 'success');
      selectedCompetitionId = null;
      loadCompetitions(); // 목록 새로고침
    } else {
      showMessage('대회 삭제 실패: ' + (result.error || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('대회 삭제 오류:', error);
    showMessage('대회 삭제 중 오류가 발생했습니다', 'error');
  }
}

// 대회 참가
// 대회 선택
function selectCompetition(competitionId) {
  // 모든 카드에서 선택 해제
  document.querySelectorAll('.competition-card').forEach(card => {
    card.style.background = '';
    card.style.borderColor = '';
    card.style.transform = '';
  });

  // 선택된 카드 강조
  const selectedCard = document.querySelector(`[data-competition-id="${competitionId}"]`);
  if (selectedCard) {
    selectedCard.style.background = '#FEF3C7';
    selectedCard.style.borderColor = '#F59E0B';
    selectedCard.style.transform = 'scale(1.02)';
  }

  selectedCompetitionId = competitionId;
}

// 대회 참가
async function joinCompetition(competitionId) {
  if (!currentUserId || !currentUser) {
    showMessage('로그인이 필요합니다', 'error');
    return;
  }

  // 종목 선택 (5K, 10K, Half, 32K, Full)
  const categories = ['5K', '10K', 'Half', '32K', 'Full'];
  const categoryOptions = categories.map((cat, idx) => `${idx + 1}. ${cat}`).join('\n');
  const categoryInput = prompt(`참가 종목을 선택하세요:\n${categoryOptions}\n\n번호를 입력하세요 (1-5):`);

  if (!categoryInput) return;

  const categoryIndex = parseInt(categoryInput) - 1;
  if (categoryIndex < 0 || categoryIndex >= categories.length) {
    showMessage('올바른 번호를 입력하세요', 'error');
    return;
  }

  const selectedCategory = categories[categoryIndex];

  try {
    const response = await fetch(`/api/competitions/${competitionId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        category: selectedCategory
      })
    });

    const result = await response.json();

    if (result.success) {
      showMessage(`${selectedCategory} 종목에 참가했습니다!`, 'success');
      loadCompetitions(); // 목록 새로고침
    } else {
      showMessage('참가 실패: ' + (result.error || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('참가 오류:', error);
    showMessage('참가 중 오류가 발생했습니다', 'error');
  }
}

// 대회 참가 취소
async function leaveCompetition(competitionId) {
  if (!currentUserId || !currentUser) {
    showMessage('로그인이 필요합니다', 'error');
    return;
  }

  if (!confirm('정말 참가를 취소하시겠습니까?')) {
    return;
  }

  try {
    const response = await fetch(`/api/competitions/${competitionId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId
      })
    });

    const result = await response.json();

    if (result.success) {
      showMessage('참가가 취소되었습니다', 'success');
      loadCompetitions(); // 목록 새로고침
    } else {
      showMessage('참가 취소 실패: ' + (result.error || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('참가 취소 오류:', error);
    showMessage('참가 취소 중 오류가 발생했습니다', 'error');
  }
}

// 전역 변수 - 선택된 사용자 ID
let selectedUserId = null;
// 전역 변수 - 선택된 대회 ID
let selectedCompetitionId = null;

// 사용자 목록 로드
async function loadUsers() {
  const listContainer = document.getElementById('userList');
  listContainer.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-dots loading-lg text-primary"></span></div>';

  try {
    const response = await fetch('/api/users');
    const users = await response.json();

    if (users.length === 0) {
      listContainer.innerHTML = `
        <div class="alert alert-info shadow-md">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>등록된 사용자가 없습니다</span>
          </div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = users.map(user => `
      <div
        class="user-card"
        data-user-id="${user.id}"
        onclick="selectUser(${user.id})"
        style="
          padding: 12px 14px;
          border-radius: 8px;
          border-left: 3px solid #4ADE80;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          background: white;
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.2s;
        "
      >
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div>
            <div style="font-size: 15px; font-weight: 600; color: #333;">
              ${user.nickname || user.name}
            </div>
            <div style="font-size: 11px; color: #999; margin-top: 2px;">
              ${user.name} ${user.strava_id ? '• Strava ID: ' + user.strava_id : ''}
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button
              class="btn btn-${user.strava_id ? 'success' : 'warning'} btn-sm"
              onclick="event.stopPropagation(); connectStrava(${user.id})"
            >
              ${user.strava_id ? '연동됨' : 'Strava 연동'}
            </button>
            ${user.strava_id && (!user.full_sync_done || user.strava_id === ADMIN_STRAVA_ID) ? `
              <button
                class="btn btn-primary btn-sm"
                onclick="event.stopPropagation(); syncUserFull(${user.id})"
              >
                전체 동기화
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('사용자 목록 로드 실패:', error);
    listContainer.innerHTML = `
      <div class="alert alert-error shadow-md">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>사용자 목록을 불러올 수 없습니다</span>
        </div>
      </div>
    `;
  }
}

// 사용자 선택
function selectUser(userId) {
  // 권한 체크: 자신의 정보이거나 관리자만 선택 가능
  if (!isAdmin() && !isOwnProfile(userId)) {
    showMessage('자신의 정보만 수정할 수 있습니다', 'error');
    return;
  }

  // 모든 카드에서 선택 해제
  document.querySelectorAll('.user-card').forEach(card => {
    card.style.background = 'white';
    card.style.borderLeft = '3px solid #4ADE80';
    card.style.transform = 'scale(1)';
  });

  // 선택된 카드 강조
  const selectedCard = document.querySelector(`[data-user-id="${userId}"]`);
  if (selectedCard) {
    selectedCard.style.background = '#F0FDF4';
    selectedCard.style.borderLeft = '3px solid #22C55E';
    selectedCard.style.transform = 'scale(1.02)';
  }

  selectedUserId = userId;
}

// 사용자 모달 열기
async function openUserModal(mode) {
  if (mode === 'create') {
    showMessage('사용자 등록 기능 준비중', 'info');
    return;
  }

  if (mode === 'edit') {
    if (!selectedUserId) {
      showMessage('수정할 사용자를 선택해주세요', 'error');
      return;
    }

    // 권한 체크
    if (!isAdmin() && !isOwnProfile(selectedUserId)) {
      showMessage('자신의 정보만 수정할 수 있습니다', 'error');
      return;
    }

    // 사용자 정보 가져오기
    const response = await fetch('/api/users');
    const users = await response.json();
    const user = users.find(u => u.id === selectedUserId);

    if (!user) {
      showMessage('사용자를 찾을 수 없습니다', 'error');
      return;
    }

    // 닉네임 입력 받기
    const newNickname = prompt('새로운 닉네임을 입력하세요', user.nickname || user.name);

    if (!newNickname || newNickname.trim() === '') {
      return;
    }

    try {
      const requestBody = { nickname: newNickname.trim() };

      // 다른 사용자 수정 시에만 비밀번호 필요 (관리자가 아니고 본인이 아닌 경우)
      if (isAdmin() && !isOwnProfile(selectedUserId)) {
        const password = prompt('관리자 비밀번호를 입력하세요:');
        if (!password) {
          showMessage('비밀번호를 입력해야 합니다', 'error');
          return;
        }
        requestBody.password = password;
      }

      const response = await fetch(`/api/users/${selectedUserId}/nickname`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (result.success) {
        showMessage('닉네임이 수정되었습니다', 'success');
        loadUsers(); // 목록 새로고침
        loadStats(); // 통계도 새로고침
        loadActivities(); // 활동도 새로고침
      } else {
        showMessage('닉네임 수정 실패: ' + (result.error || '알 수 없는 오류'), 'error');
      }
    } catch (error) {
      console.error('닉네임 수정 오류:', error);
      showMessage('닉네임 수정 중 오류가 발생했습니다', 'error');
    }
  }
}

// 사용자 삭제
async function deleteUser() {
  if (!selectedUserId) {
    showMessage('삭제할 사용자를 선택해주세요', 'error');
    return;
  }

  // 권한 체크
  if (!isAdmin() && !isOwnProfile(selectedUserId)) {
    showMessage('자신의 정보만 삭제할 수 있습니다', 'error');
    return;
  }

  if (!confirm('정말 이 사용자를 삭제하시겠습니까?')) {
    return;
  }

  // 관리자 비밀번호 입력
  const password = prompt('관리자 비밀번호를 입력하세요:');
  if (!password) {
    showMessage('비밀번호를 입력해야 합니다', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/users/${selectedUserId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    });

    const result = await response.json();

    if (result.success) {
      showMessage('사용자가 삭제되었습니다', 'success');
      selectedUserId = null;
      loadUsers(); // 목록 새로고침
      loadStats(); // 통계도 새로고침
      loadActivities(); // 활동도 새로고침
    } else {
      showMessage('사용자 삭제 실패: ' + (result.error || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('사용자 삭제 오류:', error);
    showMessage('사용자 삭제 중 오류가 발생했습니다', 'error');
  }
}

// Strava 연동
function connectStrava(userId) {
  window.location.href = '/auth/strava';
}

// 전체 동기화 (5년)
async function syncUserFull(userId) {
  if (!confirm('최근 5년치 전체 데이터를 동기화하시겠습니까?\n시간이 다소 걸릴 수 있습니다.')) {
    return;
  }

  try {
    showMessage('전체 동기화를 시작합니다...', 'info');

    const response = await fetch('/api/sync/full', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId })
    });

    const result = await response.json();

    if (result.success) {
      showMessage(`${result.syncedCount}개의 활동이 동기화되었습니다 (전체 ${result.totalActivities}개 중)`, 'success');
      loadStats(); // 통계 새로고침
      loadActivities(); // 활동 새로고침
    } else {
      showMessage('전체 동기화 실패: ' + (result.error || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('전체 동기화 오류:', error);
    showMessage('전체 동기화 중 오류가 발생했습니다', 'error');
  }
}

// ============= 활동 상세 모달 =============

// 활동 상세 정보 모달 열기
async function openActivityDetail(activityId) {
  const modal = document.getElementById('activityDetailModal');
  const content = document.getElementById('activityDetailContent');

  // 모달 열기
  modal.showModal();

  // 로딩 상태 표시
  content.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg text-primary"></span></div>';

  try {
    // API에서 활동 상세 정보 가져오기
    const response = await fetch(`/api/activities/${activityId}/detail`);
    const activity = await response.json();

    if (!response.ok) {
      throw new Error(activity.error || '활동 정보를 불러올 수 없습니다');
    }

    // 모달 제목 업데이트
    document.getElementById('activityDetailTitle').textContent = activity.name || '활동 상세';

    // 시작 시간 업데이트
    const startDate = new Date(activity.start_date);
    const dateStr = startDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
    const timeStr = startDate.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    document.getElementById('activityDetailDate').textContent = `${dateStr} ${timeStr}`;

    // 상세 정보 렌더링
    renderActivityDetail(activity);

  } catch (error) {
    console.error('활동 상세 정보 로드 실패:', error);
    content.innerHTML = `
      <div class="alert alert-error">
        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>${error.message}</span>
      </div>
    `;
  }
}

// 활동 상세 정보 렌더링
function renderActivityDetail(activity) {
  const content = document.getElementById('activityDetailContent');

  const distance = (activity.distance / 1000).toFixed(2);
  const movingTime = formatTime(activity.moving_time);
  const elapsedTime = formatTime(activity.elapsed_time);
  const pace = calculatePace(activity.distance, activity.moving_time);
  const date = new Date(activity.start_date).toLocaleString('ko-KR');

  // 카드 생성 헬퍼 함수
  const createStatCard = (icon, label, value, highlight = false) => {
    let bgClass, borderClass, labelClass, valueClass;

    if (highlight === 'primary') {
      bgClass = 'bg-gradient-to-br from-primary/10 to-primary/5';
      borderClass = 'border-primary/20';
      labelClass = 'text-primary';
      valueClass = 'text-primary';
    } else if (highlight === 'error') {
      bgClass = 'bg-gradient-to-br from-error/10 to-error/5';
      borderClass = 'border-error/20';
      labelClass = 'text-error';
      valueClass = 'text-error';
    } else {
      bgClass = 'bg-base-200';
      borderClass = 'border-base-300';
      labelClass = 'text-base-content/70';
      valueClass = '';
    }

    const emptyValue = !value || value === '-';

    return `<div class="${bgClass} rounded-lg p-2 border ${borderClass}"><div class="text-[10px] ${labelClass} font-semibold mb-0.5">${icon} ${label}</div><div class="text-base font-bold ${valueClass} ${emptyValue ? 'text-base-content/30' : ''}">${value || '-'}</div></div>`;
  };

  let html = `
    <!-- 기본 정보 -->
    <div class="grid grid-cols-2 gap-1 mb-1">
      ${createStatCard('🏃', '거리', `${distance} km`, 'primary')}
      ${createStatCard('⏱️', '기록', movingTime)}
    </div>
    <div class="grid grid-cols-2 gap-1 mb-1">
      ${createStatCard('⚡', '페이스', pace)}
      ${createStatCard('❤️', '심박수', activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : null, activity.average_heartrate ? 'error' : null)}
    </div>
    <div class="grid grid-cols-2 gap-1 mb-1">
      ${createStatCard('👟', '케이던스', activity.average_cadence ? `${Math.round(activity.average_cadence * 2)} spm` : null)}
      ${createStatCard('⛰️', '고도', `${Math.round(activity.total_elevation_gain || 0)} m`)}
    </div>

    <div class="divider my-3"></div>

    <!-- 추가 정보 -->
    <div class="bg-base-200/50 rounded-lg p-3 mb-4">
      <div class="divide-y divide-base-300/50">
        ${activity.device_name ? `
        <div class="flex items-center justify-between py-1.5">
          <span class="text-xs text-base-content/60 font-medium">⌚ 시계</span>
          <span class="text-sm font-semibold">${activity.device_name}</span>
        </div>` : ''}
        ${activity.gear ? `
        <div class="flex items-center justify-between py-1.5">
          <span class="text-xs text-base-content/60 font-medium">👟 신발</span>
          <span class="text-sm font-semibold">${activity.gear.name}${activity.gear.distance ? ` <span class="text-xs text-base-content/50">(${(activity.gear.distance / 1000).toFixed(1)} km)</span>` : ''}</span>
        </div>` : ''}
      </div>
    </div>
  `;

  // 랩 정보가 있으면 표시
  if (activity.laps && activity.laps.length > 0) {
    html += `
      <div class="divider">랩별 데이터</div>

      <!-- 차트 영역 -->
      <div class="grid grid-cols-1 gap-3 mb-4">
        <div class="bg-base-200/50 rounded-lg p-3" style="max-height: 140px;">
          <h4 class="text-xs font-semibold mb-2 text-base-content/70">⚡ 페이스</h4>
          <div style="height: 100px;">
            <canvas id="paceChart"></canvas>
          </div>
        </div>
        <div class="bg-base-200/50 rounded-lg p-3" style="max-height: 140px;">
          <h4 class="text-xs font-semibold mb-2 text-base-content/70">❤️ 심박수</h4>
          <div style="height: 100px;">
            <canvas id="heartRateChart"></canvas>
          </div>
        </div>
        <div class="bg-base-200/50 rounded-lg p-3" style="max-height: 140px;">
          <h4 class="text-xs font-semibold mb-2 text-base-content/70">👟 케이던스</h4>
          <div style="height: 100px;">
            <canvas id="cadenceChart"></canvas>
          </div>
        </div>
      </div>
    `;
  }

  // 지도가 있으면 표시
  if (activity.map && activity.map.summary_polyline) {
    html += `
      <div class="divider">경로</div>
      <div id="activityMap" style="width: 100%; height: 400px; border-radius: 8px; overflow: hidden;"></div>
    `;
  }

  // 랩별 페이스 테이블
  if (activity.laps && activity.laps.length > 0) {
    html += `
      <div class="divider">랩별 페이스</div>
      <div class="overflow-x-auto">
        <table class="table table-zebra table-sm w-full">
          <thead>
            <tr>
              <th>랩</th>
              <th>거리</th>
              <th>페이스</th>
              <th>심박</th>
            </tr>
          </thead>
          <tbody>
            ${activity.laps.map((lap, index) => {
              const lapDistance = (lap.distance / 1000).toFixed(2);
              const lapPace = calculatePace(lap.distance, lap.moving_time);
              const lapHR = lap.average_heartrate ? Math.round(lap.average_heartrate) : '-';
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${lapDistance} km</td>
                  <td>${lapPace}</td>
                  <td>${lapHR}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  content.innerHTML = html;

  // 차트 렌더링
  if (activity.laps && activity.laps.length > 0) {
    renderLapCharts(activity.laps);
  }

  // 지도 렌더링
  if (activity.map && activity.map.summary_polyline) {
    renderActivityMap(activity.map.summary_polyline);
  }
}

// 랩별 차트 렌더링
function renderLapCharts(laps) {
  const labels = laps.map((_, index) => `${index + 1}km`);

  // 페이스 데이터 (초/km)
  const paceData = laps.map(lap => {
    const paceInSeconds = (lap.moving_time / (lap.distance / 1000));
    return paceInSeconds;
  });

  // 심박수 데이터
  const heartRateData = laps.map(lap => lap.average_heartrate || null);

  // 케이던스 데이터 (spm으로 변환)
  const cadenceData = laps.map(lap => lap.average_cadence ? lap.average_cadence * 2 : null);

  // 차트 공통 옵션
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 10
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 10
          }
        }
      }
    }
  };

  // 페이스 차트
  const paceCtx = document.getElementById('paceChart');
  if (paceCtx) {
    new Chart(paceCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '페이스 (분/km)',
          data: paceData,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            reverse: true, // 페이스는 낮을수록 좋으므로 반전
            ticks: {
              ...commonOptions.scales.y.ticks,
              callback: function(value) {
                const minutes = Math.floor(value / 60);
                const seconds = Math.round(value % 60);
                return `${minutes}:${String(seconds).padStart(2, '0')}`;
              }
            }
          }
        }
      }
    });
  }

  // 심박수 차트
  const hrCtx = document.getElementById('heartRateChart');
  if (hrCtx && heartRateData.some(v => v !== null)) {
    new Chart(hrCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '심박수 (bpm)',
          data: heartRateData,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            ticks: {
              ...commonOptions.scales.y.ticks,
              callback: function(value) {
                return value + ' bpm';
              }
            }
          }
        }
      }
    });
  }

  // 케이던스 차트
  const cadenceCtx = document.getElementById('cadenceChart');
  if (cadenceCtx && cadenceData.some(v => v !== null)) {
    new Chart(cadenceCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '케이던스 (spm)',
          data: cadenceData,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            ...commonOptions.scales.y,
            ticks: {
              ...commonOptions.scales.y.ticks,
              callback: function(value) {
                return value + ' spm';
              }
            }
          }
        }
      }
    });
  }
}

// Polyline 디코딩 함수 (Google Polyline Algorithm)
function decodePolyline(encoded) {
  const poly = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push([lat / 1e5, lng / 1e5]);
  }
  return poly;
}

// 지도에 경로 표시 (Mapbox 사용)
function renderActivityMap(polyline) {
  // Mapbox GL JS가 로드되어 있지 않으면 스크립트 로드
  if (typeof mapboxgl === 'undefined') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
    script.onload = () => initMap(polyline);
    document.head.appendChild(script);
  } else {
    initMap(polyline);
  }
}

function initMap(polyline) {
  setTimeout(() => {
    const coords = decodePolyline(polyline); // [lat, lng] 형태

    if (coords.length === 0) return;

    // 기존 지도가 있으면 제거
    const mapContainer = document.getElementById('activityMap');
    if (!mapContainer) return;

    mapContainer.innerHTML = '';

    // Mapbox access token 설정 (공개 토큰 - 나중에 환경변수로 변경 권장)
    mapboxgl.accessToken = 'pk.eyJ1Ijoic29uZ2p1bmhhIiwiYSI6ImNtZ2VmdW91MTE4Z3cybXBuenZodndpeWcifQ.Tbwc9pYGsVb5IXsh8uJu_g';

    // [lng, lat] 형태로 변환
    const lngLatCoords = coords.map(c => [c[1], c[0]]);

    // bounds 계산
    const bounds = new mapboxgl.LngLatBounds();
    lngLatCoords.forEach(coord => bounds.extend(coord));

    const center = bounds.getCenter();

    // 지도 생성
    const map = new mapboxgl.Map({
      container: 'activityMap',
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [center.lng, center.lat],
      zoom: 13
    });

    map.on('load', () => {
      // 경로 데이터 추가
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: lngLatCoords
          }
        }
      });

      // 경로 레이어 추가
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#FC4C02',
          'line-width': 4,
          'line-opacity': 0.9
        }
      });

      // 시작점 마커
      new mapboxgl.Marker({ color: '#22c55e' })
        .setLngLat(lngLatCoords[0])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>시작</strong>'))
        .addTo(map);

      // 종료점 마커
      new mapboxgl.Marker({ color: '#ef4444' })
        .setLngLat(lngLatCoords[lngLatCoords.length - 1])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>종료</strong>'))
        .addTo(map);

      // 경로에 맞게 지도 확대/축소
      map.fitBounds(bounds, { padding: 40 });
    });
  }, 100);
}

// ============= 맞짱 챌린지 기능 =============

let currentChallenge = null; // 현재 활성 챌린지

// 챌린지 초기화
async function initChallenges() {
  try {
    // "스시101 맞짱" 챌린지가 있는지 확인
    const response = await fetch('/api/challenges');
    const challenges = await response.json();

    // 챌린지가 없으면 생성
    if (challenges.length === 0) {
      const createResponse = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '스시101 맞짱',
          start_date: '2025-11-07',
          end_date: '2025-12-06'
        })
      });

      const result = await createResponse.json();
      currentChallenge = { id: result.id, name: '스시101 맞짱', start_date: '2025-11-07', end_date: '2025-12-06' };
    } else {
      // 가장 최근 챌린지 사용
      currentChallenge = challenges[0];
    }

    loadChallengeProgress();
  } catch (error) {
    console.error('챌린지 초기화 실패:', error);
  }
}

// 챌린지 진행상황 로드
async function loadChallengeProgress() {
  if (!currentChallenge) return;

  const container = document.getElementById('challengeParticipants');
  container.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-dots loading-lg text-primary"></span></div>';

  try {
    const response = await fetch(`/api/challenges/${currentChallenge.id}/progress`);
    const participants = await response.json();

    if (participants.length === 0) {
      container.innerHTML = `
        <div class="card bg-base-100 shadow-md border border-base-300">
          <div class="card-body p-6 text-center">
            <p class="text-base-content/60">아직 참가자가 없습니다.</p>
            <p class="text-sm text-base-content/40 mt-2">참여 버튼을 눌러 챌린지에 참가하세요!</p>
          </div>
        </div>
      `;
      return;
    }

    // 참가자 정렬: 달성률 높은 순
    participants.sort((a, b) => b.progress_percent - a.progress_percent);

    // 남은 일수 계산
    const today = new Date();
    const endDate = new Date(currentChallenge.end_date + 'T23:59:59');
    const daysLeft = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));

    // D-Day 업데이트
    const dDayElement = document.querySelector('#challengeDDay p');
    if (dDayElement) {
      if (daysLeft > 0) {
        dDayElement.textContent = `D-${daysLeft}`;
      } else if (daysLeft === 0) {
        dDayElement.textContent = 'D-Day';
      } else {
        dDayElement.textContent = '종료';
      }
    }

    let html = '';
    participants.forEach((participant, index) => {
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

      // 진행률에 따른 색상 클래스 (고정 클래스 사용)
      const progressColorClass = participant.progress_percent >= 100 ? 'text-success' :
                                 participant.progress_percent >= 70 ? 'text-warning' : 'text-error';
      const progressBgClass = participant.progress_percent >= 100 ? 'bg-success' :
                              participant.progress_percent >= 70 ? 'bg-warning' : 'bg-error';

      const remainingDistance = Math.max(0, participant.target_distance - participant.achieved_distance);
      const dailyRequired = daysLeft > 0 ? (remainingDistance / daysLeft).toFixed(1) : 0;

      html += `
        <div class="card bg-base-100 shadow-md border border-base-300 participant-card" data-user-id="${participant.user_id}">
          <div class="card-body p-4 cursor-pointer" onclick="toggleParticipantActivities(${participant.user_id})">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <span class="text-2xl font-bold">${medal}</span>
                <div>
                  <h3 class="font-bold text-lg">${participant.user_name}</h3>
                  <p class="text-xs text-base-content/60">목표: ${participant.target_distance.toFixed(1)} km</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold ${progressColorClass}">${participant.progress_percent}%</p>
                <p class="text-xs text-base-content/60">${participant.achieved_distance.toFixed(1)} km</p>
              </div>
            </div>

            <div class="w-full bg-base-300 rounded-full h-3">
              <div class="${progressBgClass} h-3 rounded-full transition-all" style="width: ${Math.min(participant.progress_percent, 100)}%"></div>
            </div>

            <div class="flex justify-between mt-2 text-xs text-base-content/60">
              <span>활동 횟수: ${participant.activity_count}회</span>
              <span>남은 거리: ${remainingDistance.toFixed(1)} km (일일 ${dailyRequired} km)</span>
            </div>
          </div>

          <!-- 활동 리스트 (접혀있음) -->
          <div id="activities-${participant.user_id}" class="hidden px-4 pb-4">
            <div class="divider my-0"></div>
            <h4 class="font-semibold text-sm mb-2 mt-3">최근 활동</h4>
            <div class="loading-container flex justify-center py-4">
              <span class="loading loading-spinner loading-sm text-primary"></span>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // 참여 버튼 표시/숨김 결정
    updateJoinButton(participants);
  } catch (error) {
    console.error('챌린지 진행상황 로드 실패:', error);
    container.innerHTML = `
      <div class="alert alert-error shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>진행상황을 불러오는데 실패했습니다.</span>
        </div>
      </div>
    `;
  }
}

// 참여 버튼 표시/숨김 업데이트
function updateJoinButton(participants) {
  const joinBtn = document.getElementById('joinChallengeBtn');

  if (!currentUser) {
    joinBtn.style.display = 'none';
    return;
  }

  // 관리자인 경우 항상 표시
  const isAdmin = currentUser.strava_id === ADMIN_STRAVA_ID;
  if (isAdmin) {
    joinBtn.style.display = 'inline-flex';
    return;
  }

  // 현재 사용자가 이미 참가했는지 확인
  const hasJoined = participants.some(p => p.user_id === currentUser.id);

  if (hasJoined) {
    joinBtn.style.display = 'none';
  } else {
    joinBtn.style.display = 'inline-flex';
  }
}

// 참가 모달 열기
async function openJoinModal() {
  if (!currentUser) {
    alert('Strava를 먼저 연동해주세요.');
    return;
  }

  const modal = document.getElementById('joinChallengeModal');
  const targetDistance = document.getElementById('targetDistance');
  const isAdmin = currentUser.strava_id === ADMIN_STRAVA_ID;

  targetDistance.value = '';

  // 관리자인 경우 사용자 선택 드롭다운 표시
  if (isAdmin) {
    try {
      const response = await fetch('/api/users');
      const users = await response.json();

      const userSelectContainer = document.getElementById('userSelectContainer');
      const userNameDisplay = document.getElementById('userNameDisplay');

      userSelectContainer.classList.remove('hidden');
      userNameDisplay.classList.add('hidden');

      const userSelect = document.getElementById('userSelect');
      userSelect.innerHTML = '<option value="">사용자를 선택하세요</option>';

      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.nickname || user.name;
        userSelect.appendChild(option);
      });
    } catch (error) {
      console.error('사용자 목록 로드 실패:', error);
      alert('사용자 목록을 불러오는데 실패했습니다.');
      return;
    }
  } else {
    // 일반 사용자인 경우 본인 이름만 표시
    const userSelectContainer = document.getElementById('userSelectContainer');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userName = document.getElementById('joinUserName');

    userSelectContainer.classList.add('hidden');
    userNameDisplay.classList.remove('hidden');
    userName.textContent = currentUser.nickname || currentUser.name;
  }

  modal.showModal();
}

// 참가 모달 닫기
function closeJoinModal() {
  const modal = document.getElementById('joinChallengeModal');
  modal.close();
}

// 챌린지 참가 저장
async function saveJoinChallenge() {
  const targetDistance = document.getElementById('targetDistance').value;

  if (!targetDistance || targetDistance <= 0) {
    alert('목표 거리를 입력해주세요.');
    return;
  }

  if (!currentUser || !currentChallenge) {
    alert('챌린지 참가에 필요한 정보가 없습니다.');
    return;
  }

  // 관리자인 경우 선택한 사용자 ID 사용, 아니면 본인 ID 사용
  const isAdmin = currentUser.strava_id === ADMIN_STRAVA_ID;
  let selectedUserId;

  if (isAdmin) {
    const userSelect = document.getElementById('userSelect');
    selectedUserId = userSelect.value;

    if (!selectedUserId) {
      alert('사용자를 선택해주세요.');
      return;
    }
  } else {
    selectedUserId = currentUser.id;
  }

  try {
    const response = await fetch(`/api/challenges/${currentChallenge.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: selectedUserId,
        targetDistance: parseFloat(targetDistance)
      })
    });

    const result = await response.json();

    if (result.success) {
      alert('챌린지 참가가 완료되었습니다!');
      closeJoinModal();
      loadChallengeProgress();
    } else {
      alert(result.error || '참가에 실패했습니다.');
    }
  } catch (error) {
    console.error('챌린지 참가 실패:', error);
    alert('참가에 실패했습니다.');
  }
}

// 참가자 활동 토글
let expandedParticipant = null;

async function toggleParticipantActivities(userId) {
  const activitiesDiv = document.getElementById(`activities-${userId}`);

  // 이미 열려있으면 닫기
  if (expandedParticipant === userId) {
    activitiesDiv.classList.add('hidden');
    expandedParticipant = null;
    return;
  }

  // 다른 참가자가 열려있으면 닫기
  if (expandedParticipant !== null) {
    const prevActivitiesDiv = document.getElementById(`activities-${expandedParticipant}`);
    if (prevActivitiesDiv) {
      prevActivitiesDiv.classList.add('hidden');
    }
  }

  // 현재 참가자 열기
  activitiesDiv.classList.remove('hidden');
  expandedParticipant = userId;

  // 활동이 이미 로드되었는지 확인
  if (!activitiesDiv.classList.contains('loaded')) {
    try {
      const response = await fetch(`/api/challenges/${currentChallenge.id}/user/${userId}/activities`);
      const activities = await response.json();

      if (activities.length === 0) {
        activitiesDiv.innerHTML = `
          <div class="divider my-0"></div>
          <h4 class="font-semibold text-sm mb-2 mt-3">최근 활동</h4>
          <p class="text-xs text-base-content/60 text-center py-4">챌린지 기간 내 활동이 없습니다.</p>
        `;
      } else {
        // 활동 날짜 순으로 정렬 (최신순)
        activities.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

        let html = `
          <div class="divider my-0"></div>
          <h4 class="font-semibold text-sm mb-2 mt-3">최근 활동 (${activities.length}개)</h4>
          <div class="space-y-2">
        `;

        activities.forEach(activity => {
          const date = new Date(activity.start_date);
          const distance = (activity.distance / 1000).toFixed(2);
          const duration = formatDuration(activity.moving_time);
          const pace = formatPace(activity.distance, activity.moving_time);

          html += `
            <div class="bg-base-200 rounded p-2">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <p class="text-xs font-semibold">${activity.name || '러닝'}</p>
                  <p class="text-xs text-base-content/60">${date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div class="text-right">
                  <p class="text-xs font-bold">${distance} km</p>
                  <p class="text-xs text-base-content/60">${duration} · ${pace}</p>
                </div>
              </div>
            </div>
          `;
        });

        html += '</div>';
        activitiesDiv.innerHTML = html;
      }

      activitiesDiv.classList.add('loaded');
    } catch (error) {
      console.error('활동 로드 실패:', error);
      activitiesDiv.innerHTML = `
        <div class="divider my-0"></div>
        <h4 class="font-semibold text-sm mb-2 mt-3">최근 활동</h4>
        <p class="text-xs text-error text-center py-4">활동을 불러오는데 실패했습니다.</p>
      `;
    }
  }
}

// 시간 포맷팅 함수 (초 -> HH:MM:SS 또는 MM:SS)
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// 페이스 포맷팅 (분:초/km)
function formatPace(distance, time) {
  if (distance === 0) return '-';
  const paceSeconds = (time / (distance / 1000));
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.floor(paceSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
}

// 챌린지 참가자 활동 동기화
async function syncChallengeActivities() {
  if (!currentChallenge) {
    alert('챌린지 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const syncBtn = document.getElementById('syncChallengeBtn');
  const originalContent = syncBtn.innerHTML;

  // 버튼 비활성화 및 로딩 상태로 변경
  syncBtn.disabled = true;
  syncBtn.innerHTML = `
    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    동기화 중...
  `;

  try {
    // 참가자 목록 가져오기
    const response = await fetch(`/api/challenges/${currentChallenge.id}/progress`);
    const participants = await response.json();

    if (participants.length === 0) {
      alert('참가자가 없습니다.');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // 각 참가자별로 동기화 (병렬 처리)
    const syncPromises = participants.map(async (participant) => {
      try {
        const syncResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: participant.user_id })
        });

        const result = await syncResponse.json();

        if (result.success) {
          successCount++;
          return { success: true, userName: participant.user_name };
        } else {
          failCount++;
          return { success: false, userName: participant.user_name, error: result.error };
        }
      } catch (error) {
        failCount++;
        return { success: false, userName: participant.user_name, error: error.message };
      }
    });

    // 모든 동기화 완료 대기
    const results = await Promise.all(syncPromises);

    // 결과 메시지
    let message = `동기화 완료!\n성공: ${successCount}명`;
    if (failCount > 0) {
      message += `\n실패: ${failCount}명`;
    }

    alert(message);

    // 진행상황 새로고침
    loadChallengeProgress();

  } catch (error) {
    console.error('동기화 실패:', error);
    alert('동기화 중 오류가 발생했습니다.');
  } finally {
    // 버튼 원래 상태로 복원
    syncBtn.disabled = false;
    syncBtn.innerHTML = originalContent;
  }
}
