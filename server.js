require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const { initDatabase, userQueries, activityQueries, competitionQueries } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.static('public'));

// 데이터베이스 초기화 (비동기)
initDatabase();

// ============= API 라우트 =============

// 모든 사용자 조회
app.get('/api/users', async (req, res) => {
  try {
    const users = await userQueries.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 사용자 조회
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await userQueries.getUser(id);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 사용자 추가 (테스트용)
app.post('/api/users', async (req, res) => {
  try {
    const { name, strava_id } = req.body;
    const result = await userQueries.addUser(name, strava_id, null, null);
    res.json({ id: result.lastID, name, strava_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 사용자 삭제
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await userQueries.deleteUser(id);
    res.json({ success: true, message: '사용자가 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 닉네임 수정
app.put('/api/users/:id/nickname', async (req, res) => {
  try {
    const { id } = req.params;
    const { nickname } = req.body;

    if (!nickname) {
      return res.status(400).json({ error: '닉네임은 필수입니다' });
    }

    await userQueries.updateNickname(id, nickname);
    res.json({ success: true, message: '닉네임이 수정되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 최근 활동 조회
app.get('/api/activities/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const activities = await activityQueries.getRecentActivities(limit);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 사용자 활동 조회
app.get('/api/activities/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const activities = await activityQueries.getUserActivities(userId);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 활동 상세 정보 조회 (Strava API에서 가져오기)
app.get('/api/activities/:activityId/detail', async (req, res) => {
  try {
    const { activityId } = req.params;

    // DB에서 activity_id로 활동 찾기
    const activity = await activityQueries.getActivityByActivityId(activityId);

    if (!activity) {
      return res.status(404).json({ error: '활동을 찾을 수 없습니다' });
    }

    // 해당 사용자의 access_token 가져오기
    let user = await userQueries.getUser(activity.user_id);

    if (!user || !user.access_token) {
      return res.status(401).json({ error: '인증 정보가 없습니다' });
    }

    try {
      // Strava API에서 활동 상세 정보 가져오기
      const response = await axios.get(`https://www.strava.com/api/v3/activities/${activityId}`, {
        headers: { 'Authorization': `Bearer ${user.access_token}` }
      });

      res.json(response.data);
    } catch (error) {
      // 401 에러면 토큰 갱신 시도
      if (error.response && error.response.status === 401 && user.refresh_token) {
        console.log('Access token 만료, refresh 시도...');

        // Refresh token으로 새 access token 받기
        const refreshResponse = await axios.post('https://www.strava.com/oauth/token', {
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: user.refresh_token
        });

        const { access_token, refresh_token } = refreshResponse.data;

        // DB에 새 토큰 저장
        await userQueries.updateTokens(user.id, access_token, refresh_token);

        // 갱신된 토큰으로 재시도
        const retryResponse = await axios.get(`https://www.strava.com/api/v3/activities/${activityId}`, {
          headers: { 'Authorization': `Bearer ${access_token}` }
        });

        res.json(retryResponse.data);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('활동 상세 정보 조회 실패:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 활동 추가 (테스트용)
app.post('/api/activities', async (req, res) => {
  try {
    const { user_id, name, distance, moving_time, start_date } = req.body;
    const result = await activityQueries.addActivity(
      user_id,
      `test_${Date.now()}`,
      name || '러닝',
      'Run',
      distance,
      moving_time,
      moving_time,
      0,
      start_date || new Date().toISOString(),
      distance / moving_time,
      distance / moving_time * 1.2
    );
    res.json({ id: result.lastID, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 기간별 통계
app.get('/api/stats', async (req, res) => {
  try {
    const start = req.query.start;
    const end = req.query.end || new Date().toISOString();

    const stats = await activityQueries.getStatsByDateRange(start, end);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 개인 기록 (5K, 10K, Half, Full)
app.get('/api/users/:userId/records', async (req, res) => {
  try {
    const { userId } = req.params;
    const records = await activityQueries.getPersonalRecords(userId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= 대회 API =============

// 참가자 결과 자동 검색 및 업데이트 함수
async function findAndUpdateParticipantResults(competition) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const compDate = new Date(competition.date.replace(/\//g, '-'));
  compDate.setHours(0, 0, 0, 0);

  // 대회 날짜가 오늘 포함 과거인 경우만
  if (compDate > today) {
    return;
  }

  for (const participant of competition.participants) {
    if (participant.strava_id && !participant.result) {
      // 참가자의 대회 당일 활동 찾기
      const activities = await activityQueries.getActivitiesByStravaId(participant.strava_id);

      if (activities && activities.length > 0) {
        // 대회 날짜와 일치하는 활동 찾기
        const compDateStr = competition.date;

        // 해당 날짜의 모든 활동 필터링
        const sameDateActivities = activities.filter(act => {
          const actDate = new Date(act.start_date);
          const actDateStr = `${actDate.getFullYear()}/${String(actDate.getMonth() + 1).padStart(2, '0')}/${String(actDate.getDate()).padStart(2, '0')}`;
          return actDateStr === compDateStr;
        });

        let matchingActivity = null;

        if (sameDateActivities.length > 0) {
          // 1. 먼저 활동명에 대회명이 포함된 것 찾기
          matchingActivity = sameDateActivities.find(act =>
            act.name && act.name.includes(competition.name)
          );

          // 2. 없으면 종목별 거리 범위로 찾기
          if (!matchingActivity) {
            const categoryRanges = {
              '5K': { min: 4600, max: 5400 },
              '10K': { min: 9200, max: 10800 },
              'Half': { min: 20000, max: 22000 },
              '32K': { min: 30000, max: 34000 },
              'Full': { min: 40000, max: 46000 }
            };

            const range = categoryRanges[participant.category];
            if (range) {
              // 거리 범위 내의 활동들
              const inRangeActivities = sameDateActivities.filter(act =>
                act.distance >= range.min && act.distance <= range.max
              );

              // 가장 거리가 가까운 것 선택
              if (inRangeActivities.length > 0) {
                const targetDistance = (range.min + range.max) / 2;
                matchingActivity = inRangeActivities.reduce((closest, act) => {
                  const closestDiff = Math.abs(closest.distance - targetDistance);
                  const actDiff = Math.abs(act.distance - targetDistance);
                  return actDiff < closestDiff ? act : closest;
                });
              }
            }
          }
        }

        if (matchingActivity) {
          // 시간 계산 (moving_time을 시:분:초 형식으로)
          const totalSeconds = matchingActivity.moving_time;
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          let timeStr;
          if (hours > 0) {
            timeStr = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          } else {
            timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
          }

          // DB에 결과 저장
          await competitionQueries.updateParticipantResult(
            participant.id,
            matchingActivity.activity_id,
            timeStr
          );

          participant.result = timeStr;
          participant.activity_id = matchingActivity.activity_id;
        }
      }
    }
  }
}

// 모든 대회 조회
app.get('/api/competitions', async (req, res) => {
  try {
    let competitions = await competitionQueries.getAllCompetitions();

    // 각 대회에 대해 결과 자동 업데이트
    for (const comp of competitions) {
      await findAndUpdateParticipantResults(comp);
    }

    // 업데이트된 데이터 다시 조회
    competitions = await competitionQueries.getAllCompetitions();

    res.json(competitions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 대회 등록
app.post('/api/competitions', async (req, res) => {
  try {
    const { date, name, participants } = req.body;

    if (!date || !name) {
      return res.status(400).json({ error: '날짜와 대회명은 필수입니다' });
    }

    const result = await competitionQueries.addCompetition(date, name, participants || []);

    // 새로 생성된 대회 정보 가져와서 결과 자동 검색
    const newCompetition = await competitionQueries.getCompetition(result.id);
    if (newCompetition) {
      await findAndUpdateParticipantResults(newCompetition);
    }

    res.json({ success: true, id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 대회 수정
app.put('/api/competitions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, name, participants } = req.body;

    if (!date || !name) {
      return res.status(400).json({ error: '날짜와 대회명은 필수입니다' });
    }

    await competitionQueries.updateCompetition(id, date, name, participants || []);

    // 업데이트된 대회 정보 가져와서 결과 자동 검색
    const updatedCompetition = await competitionQueries.getCompetition(parseInt(id));
    if (updatedCompetition) {
      await findAndUpdateParticipantResults(updatedCompetition);
    }

    res.json({ success: true, id: parseInt(id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 대회 삭제
app.delete('/api/competitions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await competitionQueries.deleteCompetition(id);
    res.json({ success: true, message: '대회가 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Strava OAuth =============

// Strava API 헬퍼 함수들
async function fetchStravaActivities(accessToken, after = null, perPage = 200) {
  const url = 'https://www.strava.com/api/v3/athlete/activities';
  const params = {
    per_page: perPage
  };

  if (after) {
    params.after = after; // Unix timestamp
  }

  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params: params
  });

  return response.data;
}

async function fetchAllActivities(accessToken, after) {
  let allActivities = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = 'https://www.strava.com/api/v3/athlete/activities';
    const params = {
      per_page: 200,
      page: page
    };

    if (after) {
      params.after = after;
    }

    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      params: params
    });

    const activities = response.data;

    if (activities.length === 0) {
      hasMore = false;
    } else {
      allActivities = allActivities.concat(activities);
      page++;

      // Rate limit 방지: 200개씩 가져온 후 잠시 대기
      if (activities.length === 200) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        hasMore = false;
      }
    }
  }

  return allActivities;
}

async function syncUserActivities(userId, months = null) {
  const user = await userQueries.getUser(userId);

  if (!user || !user.access_token) {
    throw new Error('사용자 토큰을 찾을 수 없습니다');
  }

  let activities;
  let periodDesc;

  if (months === null) {
    // 기본 동기화: 기존 로직 유지 (첫 동기화는 5년, 이후는 1년)
    const existingActivities = await activityQueries.getUserActivities(userId);
    const isFirstSync = existingActivities.length === 0;

    if (isFirstSync) {
      console.log(`첫 동기화 시작 - 사용자 ${userId}: 5년 전부터 전체 데이터 가져오기`);
      const fiveYearsAgo = Math.floor(Date.now() / 1000) - (5 * 365 * 24 * 60 * 60);
      activities = await fetchAllActivities(user.access_token, fiveYearsAgo);
      periodDesc = '5년';
    } else {
      console.log(`정기 동기화 시작 - 사용자 ${userId}: 최근 1년 데이터 가져오기`);
      const oneYearAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
      activities = await fetchAllActivities(user.access_token, oneYearAgo);
      periodDesc = '1년';
    }
  } else {
    // 지정된 기간으로 동기화
    console.log(`동기화 시작 - 사용자 ${userId}: 최근 ${months}개월 데이터 가져오기`);
    const periodAgo = Math.floor(Date.now() / 1000) - (months * 30 * 24 * 60 * 60);
    activities = await fetchAllActivities(user.access_token, periodAgo);
    periodDesc = `${months}개월`;
  }

  // Run 타입이면서 공개 활동만 필터링
  const runActivities = activities.filter(
    activity => activity.type === 'Run' && activity.private === false
  );

  // 20개씩 청크로 나눠서 병렬 처리
  const CHUNK_SIZE = 20;
  let syncedCount = 0;

  for (let i = 0; i < runActivities.length; i += CHUNK_SIZE) {
    const chunk = runActivities.slice(i, i + CHUNK_SIZE);

    // 청크 내의 활동들을 병렬로 저장
    await Promise.all(
      chunk.map(async (activity) => {
        await activityQueries.addActivity(
          userId,
          activity.id.toString(),
          activity.name,
          activity.type,
          activity.distance,
          activity.moving_time,
          activity.elapsed_time,
          activity.total_elevation_gain,
          activity.start_date,
          activity.average_speed,
          activity.max_speed,
          activity.average_heartrate || null,
          activity.average_cadence || null
        );
      })
    );

    syncedCount += chunk.length;
    console.log(`진행중 - 사용자 ${userId}: ${syncedCount}/${runActivities.length}개 저장됨`);
  }

  console.log(`동기화 완료 - 사용자 ${userId}: ${syncedCount}개 활동 저장 (전체 ${activities.length}개 중, 기간: ${periodDesc})`);

  return { syncedCount, totalActivities: activities.length, period: periodDesc };
}

app.get('/auth/strava', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI || `http://localhost:${PORT}/auth/strava/callback`;
  
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=activity:read_all`;
  
  res.redirect(authUrl);
});

app.get('/auth/strava/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?error=access_denied');
  }

  if (!code) {
    return res.redirect('/?error=no_code');
  }

  try {
    // 토큰 교환
    const tokenResponse = await axios.post('https://www.strava.com/oauth/token', {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code'
    });

    const { access_token, refresh_token, athlete } = tokenResponse.data;

    // 사용자 확인 또는 생성
    let user = await userQueries.getUserByStravaId(athlete.id.toString());

    if (user) {
      // 기존 사용자 - 토큰 업데이트
      await userQueries.updateTokens(user.id, access_token, refresh_token);
    } else {
      // 신규 사용자 - 생성
      const result = await userQueries.addUser(
        `${athlete.firstname} ${athlete.lastname}`,
        athlete.id.toString(),
        access_token,
        refresh_token
      );
      user = { id: result.lastID };
    }

    // 성공 페이지로 리다이렉트 (사용자 ID를 쿼리 파라미터로 전달)
    res.redirect(`/?connected=true&userId=${user.id}`);
  } catch (error) {
    console.error('Strava OAuth 오류:', error.response?.data || error.message);
    res.redirect('/?error=token_exchange_failed');
  }
});

// Strava 데이터 동기화 엔드포인트 (1개월)
app.post('/api/sync', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '사용자 ID가 필요합니다' });
    }

    const result = await syncUserActivities(userId, 1); // 1개월

    res.json({
      success: true,
      message: `${result.syncedCount}개의 러닝 활동이 동기화되었습니다`,
      ...result
    });
  } catch (error) {
    console.error('동기화 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Strava 전체 데이터 동기화 엔드포인트 (5년)
app.post('/api/sync/full', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '사용자 ID가 필요합니다' });
    }

    const result = await syncUserActivities(userId, 60); // 5년 = 60개월

    // 전체 동기화 완료 플래그 설정
    await userQueries.updateFullSyncDone(userId);

    res.json({
      success: true,
      message: `${result.syncedCount}개의 러닝 활동이 동기화되었습니다 (전체 동기화)`,
      ...result
    });
  } catch (error) {
    console.error('전체 동기화 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============= 서버 시작 =============
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/stats`);
});
