const { Pool } = require('pg');

// DATABASE_URL 검증
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다!');
  console.error('   Cloudtype에서 환경 변수를 설정했는지 확인하세요.');
  console.error('   예: DATABASE_URL=postgresql://user:pass@host:5432/dbname');
  process.exit(1);
}

// PostgreSQL 연결 설정
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Promise 래퍼 함수들
async function runQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return {
      lastID: result.rows[0]?.id,
      changes: result.rowCount,
      rows: result.rows
    };
  } finally {
    client.release();
  }
}

async function getQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function allQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// 데이터베이스 초기화
async function initDatabase() {
  try {
    // 사용자 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT,
        strava_id TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER,
        full_sync_done INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 마이그레이션: expires_at 컬럼 추가 (이미 있으면 무시)
    try {
      await runQuery(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at INTEGER
      `);
      console.log('✅ 마이그레이션: expires_at 컬럼 추가 완료');
    } catch (err) {
      // 컬럼이 이미 있으면 무시
      if (!err.message.includes('already exists')) {
        console.warn('⚠️  마이그레이션 경고:', err.message);
      }
    }

    // 활동 기록 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        activity_id TEXT UNIQUE,
        name TEXT,
        type TEXT,
        distance REAL,
        moving_time INTEGER,
        elapsed_time INTEGER,
        total_elevation_gain REAL,
        start_date TIMESTAMP,
        average_speed REAL,
        max_speed REAL,
        average_heartrate REAL,
        average_cadence REAL,
        average_temp REAL,
        calories REAL,
        max_heartrate REAL,
        suffer_score REAL,
        workout_type INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // 대회 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS competitions (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 대회 참가자 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS competition_participants (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        result TEXT,
        strava_id TEXT,
        activity_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (competition_id) REFERENCES competitions (id) ON DELETE CASCADE
      )
    `);

    // 맞짱 챌린지 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS challenges (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 맞짱 챌린지 참가자 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS challenge_participants (
        id SERIAL PRIMARY KEY,
        challenge_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        target_distance REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (challenge_id) REFERENCES challenges (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(challenge_id, user_id)
      )
    `);

    console.log('✅ 데이터베이스 초기화 완료');
  } catch (error) {
    console.error('❌ 데이터베이스 초기화 실패:', error);
    throw error;
  }
}


// 사용자 관련 함수
const userQueries = {
  // 사용자 추가
  addUser: async (name, strava_id, access_token, refresh_token, expires_at = null) => {
    const result = await runQuery(
      'INSERT INTO users (name, strava_id, access_token, refresh_token, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, strava_id, access_token, refresh_token, expires_at]
    );
    return { lastID: result.rows[0].id };
  },

  // 사용자 조회
  getUser: async (id) => {
    return await getQuery('SELECT * FROM users WHERE id = $1', [id]);
  },

  // 모든 사용자 조회
  getAllUsers: async () => {
    return await allQuery('SELECT id, name, nickname, strava_id, full_sync_done, created_at FROM users');
  },

  // Strava ID로 사용자 찾기
  getUserByStravaId: async (strava_id) => {
    return await getQuery('SELECT * FROM users WHERE strava_id = $1', [strava_id]);
  },

  // 토큰 업데이트
  updateTokens: async (id, access_token, refresh_token, expires_at = null) => {
    return await runQuery(
      'UPDATE users SET access_token = $1, refresh_token = $2, expires_at = $3 WHERE id = $4',
      [access_token, refresh_token, expires_at, id]
    );
  },

  // 사용자 삭제 (활동도 함께 삭제)
  deleteUser: async (id) => {
    // 먼저 해당 사용자의 활동 삭제
    await runQuery('DELETE FROM activities WHERE user_id = $1', [id]);
    // 그 다음 사용자 삭제
    return await runQuery('DELETE FROM users WHERE id = $1', [id]);
  },

  // 닉네임 업데이트
  updateNickname: async (id, nickname) => {
    return await runQuery(
      'UPDATE users SET nickname = $1 WHERE id = $2',
      [nickname, id]
    );
  },

  // 전체 동기화 완료 플래그 업데이트
  updateFullSyncDone: async (id) => {
    return await runQuery(
      'UPDATE users SET full_sync_done = 1 WHERE id = $1',
      [id]
    );
  }
};


// 활동 기록 관련 함수
const activityQueries = {
  // 활동 추가 (또는 업데이트)
  addActivity: async (user_id, activity_id, name, type, distance, moving_time,
                      elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
                      average_heartrate = null, average_cadence = null,
                      average_temp = null, calories = null, max_heartrate = null,
                      suffer_score = null, workout_type = null) => {
    return await runQuery(`
      INSERT INTO activities (
        user_id, activity_id, name, type, distance, moving_time,
        elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
        average_heartrate, average_cadence,
        average_temp, calories, max_heartrate, suffer_score, workout_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT(activity_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        distance = EXCLUDED.distance,
        moving_time = EXCLUDED.moving_time,
        elapsed_time = EXCLUDED.elapsed_time,
        total_elevation_gain = EXCLUDED.total_elevation_gain,
        start_date = EXCLUDED.start_date,
        average_speed = EXCLUDED.average_speed,
        max_speed = EXCLUDED.max_speed,
        average_heartrate = EXCLUDED.average_heartrate,
        average_cadence = EXCLUDED.average_cadence,
        average_temp = EXCLUDED.average_temp,
        calories = EXCLUDED.calories,
        max_heartrate = EXCLUDED.max_heartrate,
        suffer_score = EXCLUDED.suffer_score,
        workout_type = EXCLUDED.workout_type
      RETURNING id
    `, [user_id, activity_id, name, type, distance, moving_time,
        elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
        average_heartrate, average_cadence,
        average_temp, calories, max_heartrate, suffer_score, workout_type]);
  },

  // 사용자의 모든 활동 조회
  getUserActivities: async (user_id) => {
    return await allQuery(`
      SELECT * FROM activities
      WHERE user_id = $1
      ORDER BY start_date DESC
    `, [user_id]);
  },

  // Strava ID로 사용자 활동 조회
  getActivitiesByStravaId: async (strava_id) => {
    return await allQuery(`
      SELECT a.* FROM activities a
      JOIN users u ON a.user_id = u.id
      WHERE u.strava_id = $1
      ORDER BY a.start_date DESC
    `, [strava_id]);
  },

  // 최근 활동 조회 (각 사용자별 최근 30개, 전체 최신 200개)
  getRecentActivities: async () => {
    // 1년 전 날짜 계산
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString();

    return await allQuery(`
      WITH ranked_activities AS (
        SELECT a.*,
          COALESCE(u.nickname, u.name) as user_name,
          ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY a.start_date DESC) as rn
        FROM activities a
        JOIN users u ON a.user_id = u.id
        WHERE a.start_date >= $1
      )
      SELECT *
      FROM ranked_activities
      WHERE rn <= 30
      ORDER BY start_date DESC
      LIMIT 200
    `, [oneYearAgoStr]);
  },

  // 기간별 통계
  getStatsByPeriod: async (since) => {
    return await allQuery(`
      SELECT
        u.id,
        u.name,
        COUNT(a.id) as activity_count,
        SUM(a.distance) as total_distance,
        SUM(a.moving_time) as total_time,
        SUM(a.total_elevation_gain) as total_elevation,
        AVG(a.average_heartrate) as avg_heartrate,
        AVG(a.average_cadence) as avg_cadence
      FROM users u
      LEFT JOIN activities a ON u.id = a.user_id
      WHERE a.start_date >= $1
      GROUP BY u.id
      ORDER BY total_distance DESC
    `, [since]);
  },

  // 날짜 범위별 통계
  getStatsByDateRange: async (start, end) => {
    return await allQuery(`
      SELECT
        u.id,
        COALESCE(u.nickname, u.name) as name,
        COUNT(a.id) as activity_count,
        SUM(a.distance) as total_distance,
        SUM(a.moving_time) as total_time,
        SUM(a.total_elevation_gain) as total_elevation,
        AVG(a.average_heartrate) as avg_heartrate,
        AVG(a.average_cadence) as avg_cadence
      FROM users u
      LEFT JOIN activities a ON u.id = a.user_id
      WHERE a.start_date >= $1 AND a.start_date <= $2
      GROUP BY u.id
      ORDER BY total_distance DESC
    `, [start, end]);
  },

  // activity_id로 활동 조회
  getActivityByActivityId: async (activity_id) => {
    return await getQuery(`
      SELECT * FROM activities
      WHERE activity_id = $1
    `, [activity_id]);
  },

  // 개인 기록 (5K, 10K, Half, Full)
  getPersonalRecords: async (userId) => {
    const distances = [
      { name: '5K', min: 4500, max: 5500 },
      { name: '10K', min: 9500, max: 10500 },
      { name: 'Half', min: 20500, max: 22000 },
      { name: 'Full', min: 41500, max: 43000 }
    ];

    const records = {};

    for (const dist of distances) {
      const record = await getQuery(`
        SELECT
          activity_id,
          name,
          distance,
          moving_time,
          start_date,
          average_speed,
          average_heartrate,
          average_cadence
        FROM activities
        WHERE user_id = $1
          AND distance >= $2
          AND distance <= $3
          AND type = 'Run'
        ORDER BY moving_time ASC
        LIMIT 1
      `, [userId, dist.min, dist.max]);

      records[dist.name] = record || null;
    }

    return records;
  }
};

// 대회 관련 함수
const competitionQueries = {
  // 대회 추가
  addCompetition: async (date, name, participants = []) => {
    const result = await runQuery(
      'INSERT INTO competitions (date, name) VALUES ($1, $2) RETURNING id',
      [date, name]
    );

    const competitionId = result.rows[0].id;

    // 참가자 추가
    if (participants.length > 0) {
      for (const participant of participants) {
        await runQuery(
          'INSERT INTO competition_participants (competition_id, name, category, strava_id, result, activity_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [competitionId, participant.name, participant.category, participant.strava_id || null, participant.result || null, participant.activity_id || null]
        );
      }
    }

    return { id: competitionId };
  },

  // 모든 대회 조회 (참가자 포함)
  getAllCompetitions: async () => {
    const competitions = await allQuery(`
      SELECT * FROM competitions
      ORDER BY date ASC
    `);

    // 각 대회에 참가자 추가
    for (const comp of competitions) {
      comp.participants = await allQuery(`
        SELECT id, name, category, result, strava_id, activity_id
        FROM competition_participants
        WHERE competition_id = $1
        ORDER BY id ASC
      `, [comp.id]);
    }

    return competitions;
  },

  // 대회 조회
  getCompetition: async (id) => {
    const competition = await getQuery(
      'SELECT * FROM competitions WHERE id = $1',
      [id]
    );

    if (competition) {
      competition.participants = await allQuery(`
        SELECT id, name, category, result, strava_id, activity_id
        FROM competition_participants
        WHERE competition_id = $1
      `, [id]);
    }

    return competition;
  },

  // 대회 수정
  updateCompetition: async (id, date, name, participants = []) => {
    await runQuery(
      'UPDATE competitions SET date = $1, name = $2 WHERE id = $3',
      [date, name, id]
    );

    // 기존 참가자 삭제 후 새로 추가
    await runQuery('DELETE FROM competition_participants WHERE competition_id = $1', [id]);

    for (const participant of participants) {
      await runQuery(
        'INSERT INTO competition_participants (competition_id, name, category, strava_id, result, activity_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, participant.name, participant.category, participant.strava_id || null, participant.result || null, participant.activity_id || null]
      );
    }

    return { id };
  },

  // 대회 삭제
  deleteCompetition: async (id) => {
    // CASCADE로 자동 삭제되지만 명시적으로 삭제
    await runQuery('DELETE FROM competition_participants WHERE competition_id = $1', [id]);
    return await runQuery('DELETE FROM competitions WHERE id = $1', [id]);
  },

  // 참가자 결과 업데이트
  updateParticipantResult: async (participantId, activityId, result) => {
    return await runQuery(
      'UPDATE competition_participants SET activity_id = $1, result = $2 WHERE id = $3',
      [activityId, result, participantId]
    );
  },

  // strava_id로 참가자 이름 업데이트
  updateParticipantNameByStravaId: async (stravaId, newName) => {
    return await runQuery(
      'UPDATE competition_participants SET name = $1 WHERE strava_id = $2',
      [newName, stravaId]
    );
  }
};

// 맞짱 챌린지 관련 함수
const challengeQueries = {
  // 챌린지 추가
  addChallenge: async (name, start_date, end_date) => {
    const result = await runQuery(
      'INSERT INTO challenges (name, start_date, end_date) VALUES ($1, $2, $3) RETURNING id',
      [name, start_date, end_date]
    );
    return { id: result.rows[0].id };
  },

  // 모든 챌린지 조회
  getAllChallenges: async () => {
    return await allQuery('SELECT * FROM challenges ORDER BY start_date DESC');
  },

  // 챌린지 조회
  getChallenge: async (id) => {
    return await getQuery('SELECT * FROM challenges WHERE id = $1', [id]);
  },

  // 챌린지에 참가
  joinChallenge: async (challenge_id, user_id, target_distance) => {
    return await runQuery(
      'INSERT INTO challenge_participants (challenge_id, user_id, target_distance) VALUES ($1, $2, $3) ON CONFLICT (challenge_id, user_id) DO UPDATE SET target_distance = EXCLUDED.target_distance RETURNING id',
      [challenge_id, user_id, target_distance]
    );
  },

  // 챌린지 참가자 조회
  getChallengeParticipants: async (challenge_id) => {
    return await allQuery(`
      SELECT cp.*, COALESCE(u.nickname, u.name) as user_name, u.strava_id
      FROM challenge_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.challenge_id = $1
      ORDER BY cp.created_at ASC
    `, [challenge_id]);
  },

  // 챌린지 참가자의 달성 거리 계산
  getChallengeProgress: async (challenge_id) => {
    const challenge = await getQuery('SELECT * FROM challenges WHERE id = $1', [challenge_id]);
    if (!challenge) return [];

    const participants = await allQuery(`
      SELECT
        cp.id,
        cp.user_id,
        cp.target_distance,
        COALESCE(u.nickname, u.name) as user_name,
        u.strava_id
      FROM challenge_participants cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.challenge_id = $1
    `, [challenge_id]);

    // 각 참가자별 달성 거리 계산
    // Strava는 UTC 기준으로 저장하므로, 챌린지 날짜(KST)를 UTC로 변환
    const startUTC = new Date(challenge.start_date + 'T00:00:00+09:00').toISOString();
    const endUTC = new Date(challenge.end_date + 'T23:59:59+09:00').toISOString();

    for (const participant of participants) {
      const stats = await getQuery(`
        SELECT
          COALESCE(SUM(distance), 0) / 1000.0 as achieved_distance,
          COUNT(*) as activity_count
        FROM activities
        WHERE user_id = $1
          AND start_date >= $2
          AND start_date <= $3
          AND type = 'Run'
      `, [participant.user_id, startUTC, endUTC]);

      participant.achieved_distance = stats?.achieved_distance || 0;
      participant.activity_count = stats?.activity_count || 0;
      participant.progress_percent = participant.target_distance > 0
        ? Math.round((participant.achieved_distance / participant.target_distance) * 100)
        : 0;
    }

    return participants;
  },

  // 챌린지 삭제
  deleteChallenge: async (id) => {
    await runQuery('DELETE FROM challenge_participants WHERE challenge_id = $1', [id]);
    return await runQuery('DELETE FROM challenges WHERE id = $1', [id]);
  },

  // 오늘의 할당량 확인 및 생성
  ensureDailyQuota: async (userId) => {
    const today = new Date().toISOString().split('T')[0];

    // 오늘 날짜의 quota가 있는지 확인
    let quota = await getQuery(
      'SELECT * FROM daily_gift_quota WHERE user_id = $1 AND quota_date = $2',
      [userId, today]
    );

    // 없으면 0-3 랜덤 생성
    if (!quota) {
      const randomMax = Math.floor(Math.random() * 4); // 0, 1, 2, 3 중 랜덤
      await runQuery(
        'INSERT INTO daily_gift_quota (user_id, quota_date, max_count, used_count) VALUES ($1, $2, $3, 0)',
        [userId, today, randomMax]
      );
      quota = await getQuery(
        'SELECT * FROM daily_gift_quota WHERE user_id = $1 AND quota_date = $2',
        [userId, today]
      );
    }

    return quota;
  },

  // 오늘 선물 가능한지 확인
  checkGiftAvailability: async (userId) => {
    const quota = await challengeQueries.ensureDailyQuota(userId);
    return quota.used_count < quota.max_count;
  },

  // 할당량 정보 가져오기 (관리자용)
  getQuotaInfo: async (userId) => {
    const today = new Date().toISOString().split('T')[0];
    const quota = await getQuery(
      'SELECT * FROM daily_gift_quota WHERE user_id = $1 AND quota_date = $2',
      [userId, today]
    );
    return quota || { max_count: 0, used_count: 0 };
  },

  // 선물하기 (일반 사용자)
  giveGift: async (fromUserId, toUserId, distance, challengeId) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const today = new Date().toISOString().split('T')[0];

      // 송신자 목표거리 차감
      await client.query(
        'UPDATE challenge_participants SET target_distance = target_distance - $1 WHERE user_id = $2 AND challenge_id = $3',
        [distance, fromUserId, challengeId]
      );

      // 수신자 목표거리 증가
      await client.query(
        'UPDATE challenge_participants SET target_distance = target_distance + $1 WHERE user_id = $2 AND challenge_id = $3',
        [distance, toUserId, challengeId]
      );

      // 선물 기록 저장
      await client.query(
        'INSERT INTO gift_logs (from_user_id, to_user_id, distance_change) VALUES ($1, $2, $3)',
        [fromUserId, toUserId, distance]
      );

      // 사용 횟수 증가
      await client.query(
        'UPDATE daily_gift_quota SET used_count = used_count + 1 WHERE user_id = $1 AND quota_date = $2',
        [fromUserId, today]
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // 관리자가 목표거리 일괄 조정
  adminAdjustTargets: async (adjustments, adminUserId, challengeId) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const adj of adjustments) {
        await client.query(
          'UPDATE challenge_participants SET target_distance = target_distance + $1 WHERE user_id = $2 AND challenge_id = $3',
          [adj.distance_change, adj.user_id, challengeId]
        );

        // 관리자 선물 기록
        await client.query(
          'INSERT INTO gift_logs (from_user_id, to_user_id, distance_change) VALUES ($1, $2, $3)',
          [adminUserId, adj.user_id, adj.distance_change]
        );
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

module.exports = {
  pool,
  initDatabase,
  userQueries,
  activityQueries,
  competitionQueries,
  challengeQueries
};
