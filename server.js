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

// 기간별 통계 (예: 최근 7일, 30일)
app.get('/api/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const stats = await activityQueries.getStatsByPeriod(since.toISOString());
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Strava OAuth =============

// Strava API 헬퍼 함수들
async function fetchStravaActivities(accessToken, after = null) {
  const url = 'https://www.strava.com/api/v3/athlete/activities';
  const params = {
    per_page: 30
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

async function syncUserActivities(userId) {
  const user = await userQueries.getUser(userId);

  if (!user || !user.access_token) {
    throw new Error('사용자 토큰을 찾을 수 없습니다');
  }

  // 최근 30일 활동 가져오기
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  const activities = await fetchStravaActivities(user.access_token, thirtyDaysAgo);

  let syncedCount = 0;

  for (const activity of activities) {
    // Run 타입만 저장
    if (activity.type === 'Run') {
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

  return { syncedCount, totalActivities: activities.length };
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
