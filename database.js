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
    return await allQuery('SELECT id, name, strava_id, created_at FROM users');
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
  }
};


// 활동 기록 관련 함수
const activityQueries = {
  // 활동 추가
  addActivity: async (user_id, activity_id, name, type, distance, moving_time,
                      elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
                      average_heartrate = null, average_cadence = null) => {
    return await runQuery(`
      INSERT OR IGNORE INTO activities (
        user_id, activity_id, name, type, distance, moving_time,
        elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
        average_heartrate, average_cadence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  // 최근 활동 조회 (모든 사용자)
  getRecentActivities: async (limit) => {
    return await allQuery(`
      SELECT a.*, u.name as user_name
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
        u.name,
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

module.exports = {
  db,
  initDatabase,
  userQueries,
  activityQueries
};
