// 현재 선택된 기간
let currentPeriod = 'thisMonth';
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
      const rankBadge = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}위`;
      const avgHR = user.avg_heartrate ? Math.round(user.avg_heartrate) : '-';
      const avgCadence = user.avg_cadence ? Math.round(user.avg_cadence * 2) : '-';

      return `
        <tr class="hover cursor-pointer" onclick="showPersonalRecords(${user.id}, '${user.name || '사용자'}')">
          <td class="font-bold">${rankBadge}</td>
          <td class="font-semibold">${user.name || '사용자'}</td>
          <td><span class="badge badge-primary badge-lg">${distance} km</span></td>
          <td class="hidden md:table-cell">${time}</td>
          <td class="hidden sm:table-cell">${user.activity_count}회</td>
          <td class="hidden lg:table-cell">${avgPace}</td>
          <td class="hidden lg:table-cell">${avgHR} bpm</td>
          <td class="hidden lg:table-cell">${avgCadence} spm</td>
        </tr>
      `;
    }).join('');

    statsContainer.innerHTML = `
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
                    <th class="hidden md:table-cell">총 시간</th>
                    <th class="hidden sm:table-cell">활동 수</th>
                    <th class="hidden lg:table-cell">평균 페이스</th>
                    <th class="hidden lg:table-cell">평균 심박수</th>
                    <th class="hidden lg:table-cell">평균 케이던스</th>
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
    return `${minutes + 1}'00"/km`;
  }

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
              <th class="hidden md:table-cell">심박수</th>
              <th class="hidden md:table-cell">케이던스</th>
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
                    <td colspan="5" class="text-base-content/60">기록 없음</td>
                  </tr>
                `;
              }

              const time = formatTime(record.moving_time, true);
              const pace = calculatePace(record.distance, record.moving_time);
              const date = new Date(record.start_date).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              });
              const hr = record.average_heartrate ? Math.round(record.average_heartrate) : '-';
              const cadence = record.average_cadence ? Math.round(record.average_cadence * 2) : '-';

              return `
                <tr class="hover">
                  <td class="font-semibold text-sm">${distanceLabels[dist]}</td>
                  <td><span class="badge badge-primary">${time}</span></td>
                  <td class="text-sm">${pace}</td>
                  <td class="hidden md:table-cell text-sm">${hr} bpm</td>
                  <td class="hidden md:table-cell text-sm">${cadence} spm</td>
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
