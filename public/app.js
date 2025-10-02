// 현재 선택된 기간
let currentPeriod = 7;
let currentUserId = null;

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  checkConnectionStatus();
  loadStats();
  loadActivities();
  setupPeriodSelector();
  setupStravaButtons();
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
      currentPeriod = parseInt(button.dataset.days);
      loadStats();
    });
  });
}

// 통계 데이터 로드
async function loadStats() {
  const statsContainer = document.getElementById('stats');
  statsContainer.innerHTML = '<div class="col-span-full flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>';

  try {
    const response = await fetch(`/api/stats?days=${currentPeriod}`);
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
    
    // 상위 3위 - 1줄로 컴팩트하게
    const topThree = stats.slice(0, 3).map((user, index) => {
      const distance = (user.total_distance / 1000).toFixed(1);
      const medals = ['🥇', '🥈', '🥉'];
      const colors = ['primary', 'secondary', 'accent'];

      return `
        <div class="flex items-center gap-2 bg-base-100 px-3 py-2 rounded-lg shadow border border-base-300 flex-1">
          <div class="text-2xl">${medals[index]}</div>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-base-content/70 truncate">${user.name || '사용자'}</div>
            <div class="text-lg font-bold text-${colors[index]}">${distance}<span class="text-xs font-normal">km</span></div>
          </div>
        </div>
      `;
    }).join('');

    // 전체 사용자 리스트 (1 row per user)
    const allUsersList = stats.map((user, index) => {
      const distance = (user.total_distance / 1000).toFixed(1);
      const time = formatTime(user.total_time);
      const avgPace = calculatePace(user.total_distance, user.total_time);
      const rankBadge = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}위`;
      const avgHR = user.avg_heartrate ? Math.round(user.avg_heartrate) : '-';
      const avgCadence = user.avg_cadence ? Math.round(user.avg_cadence) : '-';

      return `
        <tr class="hover">
          <td class="font-bold">${rankBadge}</td>
          <td class="font-semibold">${user.name || '사용자'}</td>
          <td><span class="badge badge-primary badge-lg">${distance} km</span></td>
          <td>${time}</td>
          <td>${user.activity_count}회</td>
          <td>${avgPace}</td>
          <td>${avgHR} bpm</td>
          <td>${avgCadence} spm</td>
        </tr>
      `;
    }).join('');

    statsContainer.innerHTML = `
      <!-- Top 3 Cards - 1줄 가로 배치 -->
      <div class="col-span-full flex gap-2 mb-4">
        ${topThree}
      </div>

      <!-- All Users Table -->
      <div class="col-span-full">
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title text-2xl mb-4">📊 전체 순위</h2>
            <div class="overflow-x-auto">
              <table class="table table-zebra">
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>이름</th>
                    <th>총 거리</th>
                    <th>총 시간</th>
                    <th>활동 수</th>
                    <th>평균 페이스</th>
                    <th>평균 심박수</th>
                    <th>평균 케이던스</th>
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

// 최근 활동 로드
async function loadActivities() {
  const activitiesContainer = document.getElementById('activities');
  activitiesContainer.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-dots loading-lg text-primary"></span></div>';

  try {
    const response = await fetch('/api/activities/recent?limit=10');
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
    
    // 활동 목록 생성 (DaisyUI)
    activitiesContainer.innerHTML = activities.map(activity => {
      const distance = (activity.distance / 1000).toFixed(2);
      const time = formatTime(activity.moving_time);
      const pace = calculatePace(activity.distance, activity.moving_time);
      const date = new Date(activity.start_date).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="card bg-base-100 border-l-4 border-orange-500 shadow hover:shadow-lg transition-all">
          <div class="card-body p-4">
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div>
                <h3 class="font-bold text-lg">${activity.name || '러닝'}</h3>
                <div class="badge badge-warning badge-sm mt-1">${activity.user_name}</div>
              </div>
              <div class="text-sm text-gray-500">${date}</div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <div class="stat bg-base-200 rounded p-2">
                <div class="stat-title text-xs">거리</div>
                <div class="stat-value text-lg">📏 ${distance}</div>
                <div class="stat-desc text-xs">km</div>
              </div>
              <div class="stat bg-base-200 rounded p-2">
                <div class="stat-title text-xs">시간</div>
                <div class="stat-value text-lg">⏱️ ${time}</div>
              </div>
              <div class="stat bg-base-200 rounded p-2">
                <div class="stat-title text-xs">페이스</div>
                <div class="stat-value text-lg">⚡ ${pace}</div>
              </div>
              <div class="stat bg-base-200 rounded p-2">
                <div class="stat-title text-xs">고도</div>
                <div class="stat-value text-lg">⛰️ ${Math.round(activity.total_elevation_gain || 0)}</div>
                <div class="stat-desc text-xs">m</div>
              </div>
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
function formatTime(seconds) {
  if (!seconds) return '0분';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  } else if (minutes > 0) {
    return `${minutes}분`;
  } else {
    return `${secs}초`;
  }
}

// 페이스 계산 (분/km)
function calculatePace(distance, time) {
  if (!distance || !time) return '-';

  const distanceKm = distance / 1000;
  const paceMinutes = time / 60 / distanceKm;
  const minutes = Math.floor(paceMinutes);
  const seconds = Math.round((paceMinutes - minutes) * 60);

  return `${minutes}'${seconds.toString().padStart(2, '0')}"/km`;
}

// Strava 연동 상태 확인
function checkConnectionStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const connected = urlParams.get('connected');
  const userId = urlParams.get('userId');
  const error = urlParams.get('error');

  if (connected && userId) {
    currentUserId = userId;
    localStorage.setItem('stravaUserId', userId);
    showMessage('Strava 연동 완료!', 'success');
    updateStravaButtons(true);
    // URL 파라미터 제거
    window.history.replaceState({}, document.title, '/');
  } else if (error) {
    showMessage('Strava 연동 실패: ' + error, 'error');
  } else {
    // 로컬 스토리지에서 사용자 ID 확인
    const storedUserId = localStorage.getItem('stravaUserId');
    if (storedUserId) {
      currentUserId = storedUserId;
      updateStravaButtons(true);
    }
  }
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

  const toast = document.createElement('div');
  toast.className = 'toast toast-top toast-end z-50';
  toast.innerHTML = `
    <div class="alert ${type === 'success' ? 'alert-success' : 'alert-error'} shadow-lg">
      <div>
        ${type === 'success'
          ? '<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
        }
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
