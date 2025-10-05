const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 데이터베이스 파일 경로
const dbPath = path.join(__dirname, 'running.db');
const db = new sqlite3.Database(dbPath);

// Promise 래퍼 함수들
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// 데이터베이스 초기화
async function initDatabase() {
  try {
    // 사용자 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        nickname TEXT,
        strava_id TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 활동 기록 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        activity_id TEXT UNIQUE,
        name TEXT,
        type TEXT,
        distance REAL,
        moving_time INTEGER,
        elapsed_time INTEGER,
        total_elevation_gain REAL,
        start_date DATETIME,
        average_speed REAL,
        max_speed REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // 대회 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS competitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 대회 참가자 테이블
    await runQuery(`
      CREATE TABLE IF NOT EXISTS competition_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        competition_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (competition_id) REFERENCES competitions (id) ON DELETE CASCADE
      )
    `);

    // 기존 테이블에 result 컬럼 추가 (없는 경우)
    try {
      await runQuery(`ALTER TABLE competition_participants ADD COLUMN result TEXT`);
      console.log('✅ competition_participants 테이블에 result 컬럼 추가됨');
    } catch (err) {
      // 컬럼이 이미 존재하는 경우 무시
    }

    // 기존 테이블에 nickname 컬럼 추가 (없는 경우)
    try {
      await runQuery(`ALTER TABLE users ADD COLUMN nickname TEXT`);
      console.log('✅ users 테이블에 nickname 컬럼 추가됨');
    } catch (err) {
      // 컬럼이 이미 존재하는 경우 무시
    }

    // 기존 테이블에 strava_id 컬럼 추가 (없는 경우)
    try {
      await runQuery(`ALTER TABLE competition_participants ADD COLUMN strava_id TEXT`);
      console.log('✅ competition_participants 테이블에 strava_id 컬럼 추가됨');
    } catch (err) {
      // 컬럼이 이미 존재하는 경우 무시
    }

    console.log('✅ 데이터베이스 초기화 완료');
  } catch (error) {
    console.error('❌ 데이터베이스 초기화 실패:', error);
  }
}


// 사용자 관련 함수
const userQueries = {
  // 사용자 추가
  addUser: async (name, strava_id, access_token, refresh_token) => {
    return await runQuery(
      'INSERT INTO users (name, strava_id, access_token, refresh_token) VALUES (?, ?, ?, ?)',
      [name, strava_id, access_token, refresh_token]
    );
  },

  // 사용자 조회
  getUser: async (id) => {
    return await getQuery('SELECT * FROM users WHERE id = ?', [id]);
  },
  
  // 모든 사용자 조회
  getAllUsers: async () => {
    return await allQuery('SELECT id, name, nickname, strava_id, created_at FROM users');
  },

  // Strava ID로 사용자 찾기
  getUserByStravaId: async (strava_id) => {
    return await getQuery('SELECT * FROM users WHERE strava_id = ?', [strava_id]);
  },

  // 토큰 업데이트
  updateTokens: async (id, access_token, refresh_token) => {
    return await runQuery(
      'UPDATE users SET access_token = ?, refresh_token = ? WHERE id = ?',
      [access_token, refresh_token, id]
    );
  },

  // 사용자 삭제 (활동도 함께 삭제)
  deleteUser: async (id) => {
    // 먼저 해당 사용자의 활동 삭제
    await runQuery('DELETE FROM activities WHERE user_id = ?', [id]);
    // 그 다음 사용자 삭제
    return await runQuery('DELETE FROM users WHERE id = ?', [id]);
  },

  // 닉네임 업데이트
  updateNickname: async (id, nickname) => {
    return await runQuery(
      'UPDATE users SET nickname = ? WHERE id = ?',
      [nickname, id]
    );
  }
};


// 활동 기록 관련 함수
const activityQueries = {
  // 활동 추가 (또는 업데이트)
  addActivity: async (user_id, activity_id, name, type, distance, moving_time,
                      elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
                      average_heartrate = null, average_cadence = null) => {
    return await runQuery(`
      INSERT INTO activities (
        user_id, activity_id, name, type, distance, moving_time,
        elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
        average_heartrate, average_cadence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(activity_id) DO UPDATE SET
        user_id = excluded.user_id,
        name = excluded.name,
        type = excluded.type,
        distance = excluded.distance,
        moving_time = excluded.moving_time,
        elapsed_time = excluded.elapsed_time,
        total_elevation_gain = excluded.total_elevation_gain,
        start_date = excluded.start_date,
        average_speed = excluded.average_speed,
        max_speed = excluded.max_speed,
        average_heartrate = excluded.average_heartrate,
        average_cadence = excluded.average_cadence
    `, [user_id, activity_id, name, type, distance, moving_time,
        elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
        average_heartrate, average_cadence]);
  },

  // 사용자의 모든 활동 조회
  getUserActivities: async (user_id) => {
    return await allQuery(`
      SELECT * FROM activities
      WHERE user_id = ?
      ORDER BY start_date DESC
    `, [user_id]);
  },

  // Strava ID로 사용자 활동 조회
  getActivitiesByStravaId: async (strava_id) => {
    return await allQuery(`
      SELECT a.* FROM activities a
      JOIN users u ON a.user_id = u.id
      WHERE u.strava_id = ?
      ORDER BY a.start_date DESC
    `, [strava_id]);
  },

  // 최근 활동 조회 (모든 사용자)
  getRecentActivities: async (limit) => {
    return await allQuery(`
      SELECT a.*,
        COALESCE(u.nickname, u.name) as user_name
      FROM activities a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.start_date DESC
      LIMIT ?
    `, [limit]);
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
      WHERE a.start_date >= ?
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
      WHERE a.start_date >= ? AND a.start_date <= ?
      GROUP BY u.id
      ORDER BY total_distance DESC
    `, [start, end]);
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
          name,
          distance,
          moving_time,
          start_date,
          average_speed,
          average_heartrate,
          average_cadence
        FROM activities
        WHERE user_id = ?
          AND distance >= ?
          AND distance <= ?
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
      'INSERT INTO competitions (date, name) VALUES (?, ?)',
      [date, name]
    );

    const competitionId = result.lastID;

    // 참가자 추가
    if (participants.length > 0) {
      for (const participant of participants) {
        await runQuery(
          'INSERT INTO competition_participants (competition_id, name, category, strava_id) VALUES (?, ?, ?, ?)',
          [competitionId, participant.name, participant.category, participant.strava_id || null]
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
        SELECT id, name, category, result, strava_id
        FROM competition_participants
        WHERE competition_id = ?
        ORDER BY id ASC
      `, [comp.id]);
    }

    return competitions;
  },

  // 대회 조회
  getCompetition: async (id) => {
    const competition = await getQuery(
      'SELECT * FROM competitions WHERE id = ?',
      [id]
    );

    if (competition) {
      competition.participants = await allQuery(`
        SELECT id, name, category, result, strava_id
        FROM competition_participants
        WHERE competition_id = ?
      `, [id]);
    }

    return competition;
  },

  // 대회 수정
  updateCompetition: async (id, date, name, participants = []) => {
    await runQuery(
      'UPDATE competitions SET date = ?, name = ? WHERE id = ?',
      [date, name, id]
    );

    // 기존 참가자 삭제 후 새로 추가
    await runQuery('DELETE FROM competition_participants WHERE competition_id = ?', [id]);

    for (const participant of participants) {
      await runQuery(
        'INSERT INTO competition_participants (competition_id, name, category, strava_id) VALUES (?, ?, ?, ?)',
        [id, participant.name, participant.category, participant.strava_id || null]
      );
    }

    return { id };
  },

  // 대회 삭제
  deleteCompetition: async (id) => {
    // CASCADE로 자동 삭제되지만 명시적으로 삭제
    await runQuery('DELETE FROM competition_participants WHERE competition_id = ?', [id]);
    return await runQuery('DELETE FROM competitions WHERE id = ?', [id]);
  }
};

module.exports = {
  db,
  initDatabase,
  userQueries,
  activityQueries,
  competitionQueries
};
