// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  loadAccounts();
});

// 계정 목록 로드
async function loadAccounts() {
  const container = document.getElementById('accountsContainer');
  container.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg text-primary"></span></div>';

  try {
    const response = await fetch('/api/users');
    const users = await response.json();

    if (users.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info shadow-lg">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current flex-shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>등록된 계정이 없습니다</span>
          </div>
        </div>
      `;
      return;
    }

    // 계정 카드 생성
    container.innerHTML = users.map(user => {
      const createdDate = new Date(user.created_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      return `
        <div class="card bg-base-100 border border-base-300 shadow hover:shadow-lg transition-all" data-user-id="${user.id}">
          <div class="card-body p-4">
            <div class="flex justify-between items-center">
              <div class="flex-1">
                <h3 class="font-bold text-lg">${user.name || '사용자'}</h3>
                <div class="flex gap-2 mt-2">
                  <div class="badge badge-ghost badge-sm">ID: ${user.id}</div>
                  ${user.strava_id ? `<div class="badge badge-success badge-sm">Strava: ${user.strava_id}</div>` : '<div class="badge badge-warning badge-sm">Strava 미연동</div>'}
                </div>
                <p class="text-xs text-base-content/60 mt-2">생성일: ${createdDate}</p>
              </div>

              <button
                class="btn btn-error btn-sm gap-2"
                onclick="deleteAccount(${user.id}, '${user.name || '사용자'}')"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                삭제
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('계정 로드 실패:', error);
    container.innerHTML = `
      <div class="alert alert-error shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>계정을 불러올 수 없습니다</span>
        </div>
      </div>
    `;
  }
}

// 계정 삭제
async function deleteAccount(userId, userName) {
  // 확인 대화상자
  if (!confirm(`"${userName}" 계정을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 해당 사용자의 모든 활동 기록도 함께 삭제됩니다.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
      showMessage('계정이 삭제되었습니다', 'success');
      // 해당 카드 제거 (애니메이션)
      const card = document.querySelector(`[data-user-id="${userId}"]`);
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateX(100%)';
        card.style.transition = 'all 0.3s ease-out';
        setTimeout(() => {
          card.remove();
          // 계정이 모두 삭제되었다면 안내 메시지 표시
          const container = document.getElementById('accountsContainer');
          if (container.children.length === 0) {
            loadAccounts();
          }
        }, 300);
      }
    } else {
      showMessage('삭제 실패: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('삭제 오류:', error);
    showMessage('삭제 중 오류가 발생했습니다', 'error');
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
