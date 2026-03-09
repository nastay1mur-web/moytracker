const { Pool } = require('pg');

// Пул соединений с базой данных.
// Метафора: пул — это "парк такси". Вместо того чтобы вызывать
// новое такси на каждый запрос (дорого и долго), держим 10 машин
// наготове и выдаём свободную при необходимости.

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false  // Supabase требует SSL
    },
    max: 10,                       // максимум 10 одновременных соединений
    idleTimeoutMillis: 30000,      // закрыть незанятое соединение через 30 сек
    connectionTimeoutMillis: 30000 // Supabase pooler требует больше времени
});

// Проверяем подключение при старте
pool.on('connect', () => {
    console.log('[DB] Новое соединение с PostgreSQL установлено');
});

pool.on('error', (err) => {
    console.error('[DB] Ошибка пула соединений:', err.message);
});

module.exports = pool;
