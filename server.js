require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const { initDatabase, userQueries, activityQueries } = require('./database');

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

async function syncUserActivities(userId) {
  const user = await userQueries.getUser(userId);

  if (!user || !user.access_token) {
    throw new Error('사용자 토큰을 찾을 수 없습니다');
  }

  // 기존 활동 개수 확인
  const existingActivities = await activityQueries.getUserActivities(userId);
  const isFirstSync = existingActivities.length === 0;

  let activities;

  if (isFirstSync) {
    // 첫 동기화: 5년 전부터 모든 데이터 (페이징 처리)
    console.log(`첫 동기화 시작 - 사용자 ${userId}: 5년 전부터 전체 데이터 가져오기`);
    const fiveYearsAgo = Math.floor(Date.now() / 1000) - (5 * 365 * 24 * 60 * 60);
    activities = await fetchAllActivities(user.access_token, fiveYearsAgo);
  } else {
    // 이후 동기화: 최근 1년 (페이징 처리)
    console.log(`정기 동기화 시작 - 사용자 ${userId}: 최근 1년 데이터 가져오기`);
    const oneYearAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    activities = await fetchAllActivities(user.access_token, oneYearAgo);
  }

  let syncedCount = 0;

  for (const activity of activities) {
    // Run 타입이면서 공개 활동만 저장
    if (activity.type === 'Run' && activity.private === false) {
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
      syncedCount++;
    }
  }

  console.log(`동기화 완료 - 사용자 ${userId}: ${syncedCount}개 활동 저장 (전체 ${activities.length}개 중)`);

  return { syncedCount, totalActivities: activities.length, isFirstSync };
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

// Strava 데이터 동기화 엔드포인트
app.post('/api/sync', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '사용자 ID가 필요합니다' });
    }

    const result = await syncUserActivities(userId);

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

// ============= 서버 시작 =============
app.listen(PORT, () => {
  console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/stats`);
});
