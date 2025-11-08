/**
 * SQLite에서 PostgreSQL로 데이터 마이그레이션 스크립트
 *
 * 사용법:
 * 1. .env 파일에 DATABASE_URL 설정
 * 2. node migrate-to-postgres.js
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// SQLite 연결
const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'running.db');
const sqliteDb = new sqlite3.Database(sqliteDbPath);

// PostgreSQL 연결
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// SQLite Promise 래퍼
function sqliteAll(query, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  console.log('🚀 데이터 마이그레이션 시작...\n');

  try {
    // PostgreSQL 테이블 초기화
    console.log('1️⃣  PostgreSQL 테이블 생성 중...');

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT,
        strava_id TEXT UNIQUE,
        access_token TEXT,
        refresh_token TEXT,
        full_sync_done INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
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

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS competitions (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgPool.query(`
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

    console.log('✅ 테이블 생성 완료\n');

    // 사용자 마이그레이션
    console.log('2️⃣  사용자 데이터 마이그레이션 중...');
    const users = await sqliteAll('SELECT * FROM users');

    const userIdMapping = {}; // SQLite ID → PostgreSQL ID 매핑

    for (const user of users) {
      const result = await pgPool.query(
        `INSERT INTO users (name, nickname, strava_id, access_token, refresh_token, full_sync_done, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (strava_id) DO UPDATE SET
           name = EXCLUDED.name,
           nickname = EXCLUDED.nickname,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token
         RETURNING id`,
        [user.name, user.nickname, user.strava_id, user.access_token, user.refresh_token, user.full_sync_done || 0, user.created_at]
      );

      userIdMapping[user.id] = result.rows[0].id;
    }

    console.log(`✅ ${users.length}명의 사용자 마이그레이션 완료\n`);

    // 활동 마이그레이션
    console.log('3️⃣  활동 데이터 마이그레이션 중...');
    const activities = await sqliteAll('SELECT * FROM activities');

    let activityCount = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = activities.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (activity) => {
          const newUserId = userIdMapping[activity.user_id];

          if (!newUserId) {
            console.warn(`⚠️  사용자 ID ${activity.user_id}를 찾을 수 없습니다. 활동 ${activity.activity_id} 건너뜀`);
            return;
          }

          await pgPool.query(
            `INSERT INTO activities (
              user_id, activity_id, name, type, distance, moving_time,
              elapsed_time, total_elevation_gain, start_date, average_speed, max_speed,
              average_heartrate, average_cadence, average_temp, calories,
              max_heartrate, suffer_score, workout_type, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (activity_id) DO NOTHING`,
            [
              newUserId, activity.activity_id, activity.name, activity.type,
              activity.distance, activity.moving_time, activity.elapsed_time,
              activity.total_elevation_gain, activity.start_date, activity.average_speed,
              activity.max_speed, activity.average_heartrate, activity.average_cadence,
              activity.average_temp, activity.calories, activity.max_heartrate,
              activity.suffer_score, activity.workout_type, activity.created_at
            ]
          );
        })
      );

      activityCount += batch.length;
      console.log(`   진행중: ${activityCount}/${activities.length} 활동 마이그레이션됨`);
    }

    console.log(`✅ ${activities.length}개의 활동 마이그레이션 완료\n`);

    // 대회 마이그레이션
    console.log('4️⃣  대회 데이터 마이그레이션 중...');
    const competitions = await sqliteAll('SELECT * FROM competitions');

    const competitionIdMapping = {}; // SQLite ID → PostgreSQL ID 매핑

    for (const comp of competitions) {
      const result = await pgPool.query(
        `INSERT INTO competitions (date, name, created_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [comp.date, comp.name, comp.created_at]
      );

      competitionIdMapping[comp.id] = result.rows[0].id;
    }

    console.log(`✅ ${competitions.length}개의 대회 마이그레이션 완료\n`);

    // 대회 참가자 마이그레이션
    console.log('5️⃣  대회 참가자 데이터 마이그레이션 중...');
    const participants = await sqliteAll('SELECT * FROM competition_participants');

    for (const participant of participants) {
      const newCompId = competitionIdMapping[participant.competition_id];

      if (!newCompId) {
        console.warn(`⚠️  대회 ID ${participant.competition_id}를 찾을 수 없습니다. 참가자 ${participant.id} 건너뜀`);
        continue;
      }

      await pgPool.query(
        `INSERT INTO competition_participants (competition_id, name, category, result, strava_id, activity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newCompId, participant.name, participant.category, participant.result, participant.strava_id, participant.activity_id, participant.created_at]
      );
    }

    console.log(`✅ ${participants.length}명의 참가자 마이그레이션 완료\n`);

    // 시퀀스 재설정 (다음 ID가 올바르게 생성되도록)
    const maxUserId = await pgPool.query('SELECT MAX(id) FROM users');
    if (maxUserId.rows[0].max) {
      await pgPool.query(`SELECT setval('users_id_seq', $1)`, [maxUserId.rows[0].max]);
    }

    const maxActivityId = await pgPool.query('SELECT MAX(id) FROM activities');
    if (maxActivityId.rows[0].max) {
      await pgPool.query(`SELECT setval('activities_id_seq', $1)`, [maxActivityId.rows[0].max]);
    }

    const maxCompId = await pgPool.query('SELECT MAX(id) FROM competitions');
    if (maxCompId.rows[0].max) {
      await pgPool.query(`SELECT setval('competitions_id_seq', $1)`, [maxCompId.rows[0].max]);
    }

    const maxParticipantId = await pgPool.query('SELECT MAX(id) FROM competition_participants');
    if (maxParticipantId.rows[0].max) {
      await pgPool.query(`SELECT setval('competition_participants_id_seq', $1)`, [maxParticipantId.rows[0].max]);
    }

    console.log('✅ 시퀀스 재설정 완료\n');

    console.log('🎉 마이그레이션 완료!\n');
    console.log('📊 요약:');
    console.log(`   - 사용자: ${users.length}명`);
    console.log(`   - 활동: ${activities.length}개`);
    console.log(`   - 대회: ${competitions.length}개`);
    console.log(`   - 참가자: ${participants.length}명`);

  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  } finally {
    sqliteDb.close();
    await pgPool.end();
  }
}

// 실행
migrate().catch(console.error);
