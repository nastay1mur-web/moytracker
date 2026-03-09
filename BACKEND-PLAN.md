# BACKEND-PLAN.md — Бэкенд трекера привычек под ключ

> Составлен на основе: research.md, telegram-brief.md, tg-app/index.html, ответов владельца проекта.
> Цель: разработчик читает этот файл один раз и реализует бэкенд без дополнительных вопросов.

---

## 1. Архитектура системы

```
Telegram-бот (@tracker_privichka_bot)
    │
    ├── /start → приветствие + кнопка "Открыть трекер" + инструкция текстом
    ├── /help  → инструкция по использованию
    ├── /stats → быстрая статистика в чате
    │
    ├── Cron-напоминания (каждую минуту) → sendMessage() нужным пользователям
    │
    └── WebApp URL: https://tg-app-green.vercel.app
             │
             └── Фронтенд (tg-app/index.html)
                      │  Authorization: tg-initdata <rawInitData>
                      │
                      └── Бэкенд API (Express, Node.js)
                               │  Верификация HMAC-SHA256 на каждом запросе
                               │
                               └── PostgreSQL (Supabase)
                                        ├── users
                                        ├── habits
                                        ├── reminders
                                        ├── completions
                                        ├── achievements
                                        └── payments
```

---

## 2. Технический стек

| Слой | Технология | Обоснование |
|---|---|---|
| Бэкенд | Node.js + Express | Уже в package.json, единый язык с фронтом |
| Telegram-бот | Telegraf (Node.js) | Самый зрелый фреймворк для Telegram на Node |
| База данных | PostgreSQL (Supabase) | Бесплатно 500MB, не засыпает, управление через веб |
| Планировщик | node-cron | Запуск cron-задач внутри того же процесса |
| Авторизация | HMAC-SHA256 (crypto, встроен в Node) | Стандарт Telegram Mini App |
| Оплата | Telegram Payments + ЮKassa | Рубли, нативно в Telegram |
| Деплой (сейчас) | Render (free tier) | Бесплатно, не засыпает при cron-запросах |
| Деплой (потом) | Railway | $5/мес, без засыпаний, автодеплой из GitHub |

### Почему Render, а не Render-sleep

Render засыпает только если нет входящих HTTP-запросов. Наш cron-планировщик живёт внутри процесса — он не дёргает себя через HTTP. Поэтому сервис не засыпает, пока процесс жив. Плюс можно добавить внешний пинг через UptimeRobot (бесплатно).

---

## 3. Схема базы данных

### 3.1 Таблица `users`

```sql
CREATE TABLE users (
    id                    SERIAL PRIMARY KEY,
    telegram_id           BIGINT UNIQUE NOT NULL,
    first_name            TEXT NOT NULL,
    last_name             TEXT,
    username              TEXT,
    language_code         TEXT DEFAULT 'ru',

    -- Онбординг
    is_onboarded          BOOLEAN DEFAULT FALSE,

    -- Настройки (хранятся как JSON для гибкости)
    settings              JSONB DEFAULT '{
        "notifications": true,
        "week_start": "monday",
        "theme": "system"
    }',

    -- Подписка
    subscription_status   TEXT DEFAULT 'free',   -- 'free' | 'active' | 'expired'
    subscription_expires_at TIMESTAMP,
    habits_limit          INTEGER DEFAULT 3,     -- 3 для free, 999 для paid

    created_at            TIMESTAMP DEFAULT NOW(),
    updated_at            TIMESTAMP DEFAULT NOW()
);
```

**Правило бизнес-логики:**
- `free`: до 3 привычек, базовые напоминания
- `active`: безлимит привычек, все функции
- `expired`: ограничения как у `free`, бот пишет о необходимости продлить

---

### 3.2 Таблица `habits`

```sql
CREATE TABLE habits (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,

    name             TEXT NOT NULL,           -- "Выпить воду"
    emoji            TEXT DEFAULT 'star',     -- "💧"
    color            TEXT DEFAULT '#2AABEE',  -- hex-цвет для heatmap

    -- Секция дня (для группировки на главном экране)
    section          TEXT DEFAULT 'any',      -- 'morning' | 'evening' | 'any'

    -- Частота выполнения
    frequency_type   TEXT DEFAULT 'daily',   -- 'daily' | 'weekly'
    -- Для weekly: массив дней ['mon','tue','wed','thu','fri','sat','sun']
    -- Для daily: null
    frequency_days   TEXT[],

    -- Для streak freeze (v1.1): количество доступных заморозок
    freeze_count     INTEGER DEFAULT 0,

    -- Архив (не удаляем физически, чтобы сохранить историю completions)
    is_archived      BOOLEAN DEFAULT FALSE,
    archived_at      TIMESTAMP,

    sort_order       INTEGER DEFAULT 0,       -- порядок в списке
    created_at       TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрой выборки
CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habits_user_active ON habits(user_id) WHERE is_archived = FALSE;
```

**Правило:** При "удалении" привычки через UI — ставим `is_archived = TRUE`, не DELETE. История completions сохраняется для статистики.

---

### 3.3 Таблица `reminders`

```sql
CREATE TABLE reminders (
    id         SERIAL PRIMARY KEY,
    habit_id   INTEGER REFERENCES habits(id) ON DELETE CASCADE,
    time       TEXT NOT NULL,   -- формат "HH:MM", например "08:00"

    created_at TIMESTAMP DEFAULT NOW(),

    -- Уникальность: одно время = одна запись на привычку
    UNIQUE(habit_id, time)
);

CREATE INDEX idx_reminders_habit_id ON reminders(habit_id);
CREATE INDEX idx_reminders_time ON reminders(time);
```

**Примеры данных:**
```
habit_id=5 (Витамины), time="06:00"
habit_id=1 (Вода),     time="08:00"
habit_id=6 (Прогулка), time="19:00"
```

---

### 3.4 Таблица `completions`

```sql
CREATE TABLE completions (
    id             SERIAL PRIMARY KEY,
    habit_id       INTEGER REFERENCES habits(id) ON DELETE CASCADE,
    completed_date DATE NOT NULL,
    created_at     TIMESTAMP DEFAULT NOW(),

    -- Уникальность: одна запись на привычку в день
    UNIQUE(habit_id, completed_date)
);

CREATE INDEX idx_completions_habit_id ON completions(habit_id);
CREATE INDEX idx_completions_date ON completions(completed_date);
-- Составной индекс для типичного запроса "все выполнения за дату по пользователю"
CREATE INDEX idx_completions_habit_date ON completions(habit_id, completed_date);
```

---

### 3.5 Таблица `achievements`

```sql
CREATE TABLE achievements (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    habit_id    INTEGER REFERENCES habits(id) ON DELETE CASCADE,

    -- Типы: 'streak_7' | 'streak_30' | 'streak_100'
    type        TEXT NOT NULL,

    achieved_at TIMESTAMP DEFAULT NOW(),

    -- Нельзя выдать одно достижение дважды за одну привычку
    UNIQUE(habit_id, type)
);
```

---

### 3.6 Таблица `payments`

```sql
CREATE TABLE payments (
    id                        SERIAL PRIMARY KEY,
    user_id                   INTEGER REFERENCES users(id) ON DELETE CASCADE,

    amount                    INTEGER NOT NULL,          -- в рублях, всегда 100
    currency                  TEXT DEFAULT 'RUB',

    -- Данные от Telegram Payments
    telegram_payment_charge_id TEXT UNIQUE,              -- уникальный ID от Telegram
    provider_payment_charge_id TEXT,                     -- ID от ЮKassa

    status                    TEXT DEFAULT 'pending',    -- 'pending' | 'success' | 'failed'

    -- Период подписки, который оплачен
    period_start              TIMESTAMP,
    period_end                TIMESTAMP,                 -- +30 дней от period_start

    created_at                TIMESTAMP DEFAULT NOW()
);
```

---

## 4. Структура проекта (файлы)

```
backend/
├── package.json
├── .env                    # переменные окружения (не в git)
├── .env.example
│
├── src/
│   ├── index.js            # точка входа: запуск Express + бот + cron
│   │
│   ├── bot/
│   │   ├── index.js        # инициализация Telegraf
│   │   ├── commands.js     # /start, /help, /stats
│   │   └── payments.js     # pre_checkout_query, successful_payment
│   │
│   ├── api/
│   │   ├── router.js       # подключение всех роутеров
│   │   ├── auth.js         # middleware верификации initData
│   │   ├── users.js        # POST /api/users/me, PATCH /api/users/settings
│   │   ├── habits.js       # CRUD /api/habits
│   │   ├── reminders.js    # CRUD /api/reminders
│   │   ├── completions.js  # POST/DELETE /api/completions
│   │   ├── stats.js        # GET /api/stats
│   │   └── subscription.js # GET /api/subscription, POST /api/subscription/invoice
│   │
│   ├── cron/
│   │   └── reminders.js    # cron каждую минуту → отправка напоминаний
│   │
│   ├── db/
│   │   ├── index.js        # пул соединений pg
│   │   └── migrations/
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_habits.sql
│   │       ├── 003_create_reminders.sql
│   │       ├── 004_create_completions.sql
│   │       ├── 005_create_achievements.sql
│   │       └── 006_create_payments.sql
│   │
│   └── lib/
│       ├── streak.js       # расчёт streak, проверка достижений
│       └── messages.js     # шаблоны текстовых сообщений бота
│
└── README.md
```

---

## 5. Переменные окружения (`.env`)

```env
# Telegram Bot
BOT_TOKEN=7834815652:AAHcmf-...          # токен от @BotFather

# База данных (Supabase)
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres

# Безопасность
NODE_ENV=production

# Оплата (ЮKassa)
PAYMENT_PROVIDER_TOKEN=<токен провайдера от @BotFather → Payments → ЮKassa>

# URL фронтенда (для кнопки в боте)
WEBAPP_URL=https://tg-app-green.vercel.app

# Порт
PORT=8000
```

---

## 6. Авторизация: верификация initData

**Каждый запрос к API** должен содержать заголовок:
```
Authorization: tg-initdata <rawInitData>
```

Middleware `src/api/auth.js`:

```js
const crypto = require('crypto');

function verifyTelegramInitData(rawInitData, botToken) {
    const params = new URLSearchParams(rawInitData);
    const hash = params.get('hash');
    params.delete('hash');

    // Отсортировать параметры и собрать строку
    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${key}=${val}`)
        .join('\n');

    // HMAC-SHA256: ключ = HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    const expectedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return expectedHash === hash;
}

module.exports = async function authMiddleware(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('tg-initdata ')) {
        return res.status(401).json({ error: 'Missing authorization' });
    }

    const rawInitData = header.slice('tg-initdata '.length);

    if (!verifyTelegramInitData(rawInitData, process.env.BOT_TOKEN)) {
        return res.status(401).json({ error: 'Invalid initData signature' });
    }

    const params = new URLSearchParams(rawInitData);
    const user = JSON.parse(params.get('user'));

    // Получить или создать пользователя в БД
    const dbUser = await upsertUser(user);
    req.telegramUser = user;
    req.user = dbUser;       // объект из таблицы users
    next();
};

async function upsertUser(tgUser) {
    const { rows } = await db.query(`
        INSERT INTO users (telegram_id, first_name, last_name, username)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (telegram_id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name  = EXCLUDED.last_name,
            username   = EXCLUDED.username,
            updated_at = NOW()
        RETURNING *
    `, [tgUser.id, tgUser.first_name, tgUser.last_name, tgUser.username]);
    return rows[0];
}
```

**В production:** проверять также `auth_date` — если старше 24 часов, отклонять (защита от replay-атак).

---

## 7. API Endpoints

Все роуты защищены middleware `auth`. Все ответы в JSON.

### 7.1 Пользователь

#### `POST /api/users/me`
Первый запрос при открытии Mini App. Возвращает данные пользователя. Если новый — `is_onboarded: false`, фронт показывает онбординг.

**Запрос:** только заголовок Authorization

**Ответ:**
```json
{
  "id": 42,
  "telegram_id": 123456789,
  "first_name": "Анна",
  "username": "anna_test",
  "is_onboarded": false,
  "subscription_status": "free",
  "habits_limit": 3,
  "settings": {
    "notifications": true,
    "week_start": "monday",
    "theme": "system"
  }
}
```

#### `PATCH /api/users/settings`
Обновление настроек пользователя.

**Тело:**
```json
{
  "notifications": true,
  "week_start": "monday",
  "theme": "dark",
  "is_onboarded": true
}
```

**Ответ:** `{ "ok": true }`

---

### 7.2 Привычки

#### `GET /api/habits`
Все активные привычки пользователя с их напоминаниями.

**Ответ:**
```json
[
  {
    "id": 1,
    "name": "Выпить 8 стаканов воды",
    "emoji": "💧",
    "color": "#2AABEE",
    "section": "morning",
    "frequency_type": "daily",
    "frequency_days": null,
    "sort_order": 0,
    "reminders": ["08:00"],
    "streak": 7,
    "is_done_today": true
  },
  {
    "id": 2,
    "name": "Бассейн",
    "emoji": "🏊",
    "color": "#30D158",
    "section": "morning",
    "frequency_type": "weekly",
    "frequency_days": ["mon", "wed", "fri"],
    "sort_order": 1,
    "reminders": ["07:00"],
    "streak": 3,
    "is_done_today": false
  }
]
```

**Логика сервера:**
- Джойнить `reminders` через подзапрос
- Streak считать через рекурсивный запрос или в `src/lib/streak.js`
- `is_done_today` — проверить `completions` за `CURRENT_DATE`
- Не включать `is_archived = TRUE`

#### `POST /api/habits`
Создать новую привычку.

**Тело:**
```json
{
  "name": "Бассейн",
  "emoji": "🏊",
  "color": "#30D158",
  "section": "morning",
  "frequency_type": "weekly",
  "frequency_days": ["mon", "wed", "fri"],
  "reminders": ["07:00"]
}
```

**Логика сервера:**
1. Проверить лимит: `SELECT COUNT(*) FROM habits WHERE user_id = ? AND is_archived = FALSE`
2. Если `count >= habits_limit` и `subscription_status != 'active'` → 403 с текстом ошибки
3. Вставить в `habits`
4. Вставить в `reminders` (если переданы)
5. Вернуть созданный объект привычки

**Ответ:** объект привычки (как в GET)

**Ошибка при превышении лимита:**
```json
{
  "error": "habits_limit_reached",
  "message": "На бесплатном тарифе можно добавить не более 3 привычек",
  "upgrade_available": true
}
```

#### `PATCH /api/habits/:id`
Редактировать привычку. Только свою (проверять `user_id`).

**Тело** (все поля опциональны):
```json
{
  "name": "Новое название",
  "emoji": "🌊",
  "color": "#FF9500",
  "section": "evening",
  "frequency_type": "daily",
  "frequency_days": null,
  "reminders": ["07:00", "20:00"]
}
```

**Логика:** если переданы `reminders` — удалить старые, вставить новые.

**Ответ:** обновлённый объект привычки

#### `DELETE /api/habits/:id`
Архивировать привычку (не физическое удаление).

**Логика:**
```sql
UPDATE habits SET is_archived = TRUE, archived_at = NOW()
WHERE id = $1 AND user_id = $2
```

**Ответ:** `{ "ok": true }`

#### `PATCH /api/habits/reorder`
Изменить порядок привычек в списке.

**Тело:**
```json
{ "order": [3, 1, 5, 2] }
```
Массив ID в нужном порядке — обновить `sort_order` для каждого.

---

### 7.3 Выполнения

#### `POST /api/completions`
Отметить привычку выполненной.

**Тело:**
```json
{
  "habit_id": 1,
  "date": "2026-03-07"
}
```

**Логика:**
1. Проверить, что привычка принадлежит пользователю
2. Проверить частоту: если `frequency_type = 'weekly'`, убедиться что этот день входит в `frequency_days` (иначе 400)
3. INSERT с `ON CONFLICT DO NOTHING`
4. Вызвать `checkAchievements(habit_id)` — проверить streak и выдать достижения

**Ответ:**
```json
{
  "ok": true,
  "streak": 8,
  "achievement": null
}
```

или если выдано достижение:
```json
{
  "ok": true,
  "streak": 7,
  "achievement": {
    "type": "streak_7",
    "message": "Серия 7 дней! Первая неделя пройдена!"
  }
}
```

#### `DELETE /api/completions`
Снять отметку о выполнении.

**Тело:**
```json
{
  "habit_id": 1,
  "date": "2026-03-07"
}
```

**Ответ:** `{ "ok": true, "streak": 6 }`

---

### 7.4 Статистика

#### `GET /api/stats`

**Query-параметры:**
- `period` — `week` (по умолчанию) | `month`

**Ответ:**
```json
{
  "period": "week",
  "completion_pct": 85,
  "total_completions": 34,
  "habits": [
    {
      "id": 1,
      "name": "Вода",
      "emoji": "💧",
      "streak": 7,
      "best_streak": 21,
      "completion_pct_30d": 87
    }
  ],
  "best_day": {
    "name": "Среда",
    "pct": 100
  },
  "hide_failures": false
}
```

**Логика расчёта completion_pct:**
```sql
-- За 7 дней: выполнено / (привычки × дни) × 100
-- Учитывать frequency_days: в расчёт включать только те дни, когда привычка запланирована
```

---

### 7.5 Подписка и оплата

#### `GET /api/subscription`
Текущий статус подписки.

**Ответ:**
```json
{
  "status": "active",
  "expires_at": "2026-04-07T12:00:00Z",
  "days_left": 31,
  "price_rub": 100
}
```

#### `POST /api/subscription/invoice`
Создать счёт на оплату подписки через Telegram Payments.

**Логика:** вызвать `bot.telegram.sendInvoice()` от имени бота пользователю.

**Тело:** пустое (всё берётся из `req.user`)

**Ответ:** `{ "ok": true, "message": "Счёт отправлен в чат" }`

**Параметры инвойса:**
```js
bot.telegram.sendInvoice(telegram_id, {
    title: 'Трекер привычек — 1 месяц',
    description: 'Безлимитные привычки, все напоминания, подробная статистика',
    payload: `sub_${user_id}_${Date.now()}`,
    provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
    currency: 'RUB',
    prices: [{ label: 'Подписка на 1 месяц', amount: 10000 }], // в копейках
    start_parameter: 'subscription'
});
```

---

## 8. Telegram-бот: команды

### `/start`

Отправляет:
1. Приветственное сообщение с именем пользователя
2. Кнопку "Открыть трекер" (InlineKeyboardButton с `web_app`)
3. Краткую инструкцию текстом

```
Привет, Анна! 👋

Я — твой личный трекер привычек. Помогу не забывать о важном
и отслеживать прогресс каждый день.

Что я умею:
• Напоминать о привычках в нужное время
• Считать серии выполнений (streak)
• Показывать статистику за неделю и месяц
• Поздравлять с достижениями

Как добавить привычку:
1. Нажми "Открыть трекер"
2. На главном экране нажми кнопку [+]
3. Введи название, выбери иконку и время напоминания
4. Нажми "Сохранить"

Как настроить напоминание:
• При создании привычки выбери время
• Бот пришлёт сообщение в этот чат в нужное время

[Открыть трекер]   ← кнопка Mini App
```

### `/help`

Полная инструкция (тот же текст что и при /start, но без приветствия). Разделена на блоки:
- Как добавить привычку
- Как настроить напоминание
- Как читать статистику
- Как работают серии (streak)
- Как оплатить подписку

### `/stats`

Быстрая статистика прямо в чате (без открытия Mini App):

```
Твой прогресс за неделю:

Серии:
🔥 Вода — 7 дней
🔥 Медитация — 3 дня
🔥 Прогулка — 1 день

Выполнено за неделю: 85%

[Открыть подробную статистику]
```

### Обработка оплаты

```js
// Предварительная проверка (обязательно ответить в течение 10 сек)
bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
});

// Успешная оплата
bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const userId = ctx.from.id;

    // Записать в payments
    await db.query(`
        INSERT INTO payments (user_id, amount, telegram_payment_charge_id,
                              provider_payment_charge_id, status, period_start, period_end)
        VALUES (
            (SELECT id FROM users WHERE telegram_id = $1),
            100, $2, $3, 'success', NOW(), NOW() + INTERVAL '30 days'
        )
    `, [userId, payment.telegram_payment_charge_id, payment.provider_payment_charge_id]);

    // Обновить статус подписки пользователя
    await db.query(`
        UPDATE users SET
            subscription_status = 'active',
            subscription_expires_at = NOW() + INTERVAL '30 days',
            habits_limit = 999
        WHERE telegram_id = $1
    `, [userId]);

    await ctx.reply('✅ Подписка активирована на 30 дней! Лимит привычек снят.');
});
```

---

## 9. Система напоминаний (Cron)

Файл: `src/cron/reminders.js`

### Принцип работы

- Cron запускается каждую минуту
- Получает текущее время в формате `HH:MM`
- Находит все напоминания с `time = 'HH:MM'`
- Джойнит с привычками и пользователями
- Для каждого пользователя группирует привычки по времени
- Отправляет **одно сообщение** в чат (если несколько привычек в одно время)

### SQL-запрос для выборки

```sql
SELECT
    u.telegram_id,
    u.first_name,
    u.settings,
    h.id        AS habit_id,
    h.name      AS habit_name,
    h.emoji,
    h.section,
    h.frequency_type,
    h.frequency_days,
    r.time
FROM reminders r
JOIN habits h ON h.id = r.habit_id
JOIN users  u ON u.id = h.user_id
WHERE
    r.time = $1                          -- текущее время "HH:MM"
    AND h.is_archived = FALSE
    AND u.settings->>'notifications' = 'true'
    AND (
        -- Ежедневная привычка: всегда отправляем
        h.frequency_type = 'daily'
        OR
        -- Еженедельная: проверяем день недели
        (h.frequency_type = 'weekly' AND $2 = ANY(h.frequency_days))
    )
    -- Не слать если уже выполнена сегодня
    AND NOT EXISTS (
        SELECT 1 FROM completions c
        WHERE c.habit_id = h.id
          AND c.completed_date = CURRENT_DATE
    )
```

`$2` — текущий день недели: `'mon'`, `'tue'`, `'wed'`, `'thu'`, `'fri'`, `'sat'`, `'sun'`

### Формат сообщения

**Одна привычка:**
```
⏰ 08:00

💧 Пора выпить воду
Серия: 🔥 7 дней — не прерывай!
```

**Несколько привычек в одно время:**
```
⏰ 08:00

Пора сделать:
💧 Выпить воду (🔥 7 дн.)
💊 Принять витамины (🔥 3 дн.)
```

**Если серия равна 0:**
```
⏰ 08:00

💧 Пора выпить воду
Начни новую серию сегодня!
```

### Код планировщика

```js
const cron = require('node-cron');

cron.schedule('* * * * *', async () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayOfWeek = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];

    const { rows } = await db.query(REMINDER_QUERY, [time, dayOfWeek]);

    // Группируем по telegram_id
    const byUser = {};
    for (const row of rows) {
        if (!byUser[row.telegram_id]) byUser[row.telegram_id] = [];
        byUser[row.telegram_id].push(row);
    }

    // Отправляем сообщения
    for (const [telegramId, habits] of Object.entries(byUser)) {
        const text = buildReminderText(time, habits);
        try {
            await bot.telegram.sendMessage(telegramId, text, { parse_mode: 'HTML' });
        } catch (err) {
            // Пользователь заблокировал бота — помечаем notifications: false
            if (err.code === 403) {
                await db.query(
                    `UPDATE users SET settings = settings || '{"notifications": false}'::jsonb WHERE telegram_id = $1`,
                    [telegramId]
                );
            }
        }
    }
});
```

---

## 10. Достижения: логика проверки

Файл: `src/lib/streak.js`

```js
async function checkAchievements(habitId, userId) {
    const streak = await calculateStreak(habitId);

    const milestones = [
        { type: 'streak_7',   days: 7,   message: '🎯 Серия 7 дней! Первая неделя пройдена — это настоящий старт!' },
        { type: 'streak_30',  days: 30,  message: '🏆 Серия 30 дней! Месяц без пропуска — ты формируешь привычку на всю жизнь!' },
        { type: 'streak_100', days: 100, message: '👑 Серия 100 дней! Это уже легенда. Ты можешь всё.' },
    ];

    for (const m of milestones) {
        if (streak === m.days) {
            // Попытка вставки — если UNIQUE нарушен, значит уже выдавали
            const { rowCount } = await db.query(`
                INSERT INTO achievements (user_id, habit_id, type)
                VALUES ($1, $2, $3)
                ON CONFLICT (habit_id, type) DO NOTHING
            `, [userId, habitId, m.type]);

            if (rowCount > 0) {
                // Новое достижение — отправить сообщение в бот
                const { rows } = await db.query(
                    'SELECT telegram_id FROM users WHERE id = $1', [userId]
                );
                const habit = await db.query(
                    'SELECT name, emoji FROM habits WHERE id = $1', [habitId]
                );
                const h = habit.rows[0];

                await bot.telegram.sendMessage(
                    rows[0].telegram_id,
                    `${m.message}\n\nПривычка: ${h.emoji} ${h.name}`
                );

                return { type: m.type, message: m.message };
            }
        }
    }
    return null;
}
```

---

## 11. Логика частоты привычек (frequency)

### При отображении на главном экране

Фронтенд получает `frequency_type` и `frequency_days`. Показывает привычку на главном экране только если она запланирована на сегодня:

```js
function isScheduledToday(habit) {
    if (habit.frequency_type === 'daily') return true;
    const days = ['sun','mon','tue','wed','thu','fri','sat'];
    const today = days[new Date().getDay()];
    return habit.frequency_days?.includes(today) ?? false;
}
```

### При расчёте streak

Streak считается только по тем дням, когда привычка была запланирована. Пропуск в незапланированный день не ломает серию.

```js
async function calculateStreak(habitId) {
    const { rows: habit } = await db.query(
        'SELECT frequency_type, frequency_days FROM habits WHERE id = $1', [habitId]
    );
    const { frequency_type, frequency_days } = habit[0];

    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);

        // Проверяем, была ли привычка запланирована в этот день
        if (frequency_type === 'weekly') {
            const days = ['sun','mon','tue','wed','thu','fri','sat'];
            if (!frequency_days.includes(days[d.getDay()])) continue; // пропустить
        }

        const dateStr = d.toISOString().slice(0, 10);
        const { rows } = await db.query(
            'SELECT 1 FROM completions WHERE habit_id = $1 AND completed_date = $2',
            [habitId, dateStr]
        );

        if (rows.length > 0) streak++;
        else break; // серия прервана
    }

    return streak;
}
```

---

## 12. Монетизация: полная схема

### Модель

| Тариф | Цена | Привычки | Напоминания | Статистика |
|---|---|---|---|---|
| Бесплатный | 0 руб/мес | до 3 | есть | базовая (7 дней) |
| Платный | 100 руб/мес | безлимит | есть | расширенная (30 дней) |

### Технический флоу оплаты

```
Пользователь нажимает "Оформить подписку" в Mini App
    ↓
Фронт: POST /api/subscription/invoice
    ↓
Бэкенд: bot.telegram.sendInvoice(telegram_id, ...) → ЮKassa
    ↓
Telegram показывает нативный экран оплаты
    ↓
Пользователь оплачивает
    ↓
Telegram → bot pre_checkout_query → отвечаем answerPreCheckoutQuery(true)
    ↓
Telegram → bot successful_payment
    ↓
Бэкенд: INSERT payments + UPDATE users SET subscription_status='active', habits_limit=999
    ↓
Бот: "✅ Подписка активирована на 30 дней!"
```

### Напоминание о продлении

Cron раз в сутки (в 10:00):
```sql
SELECT telegram_id, first_name, subscription_expires_at
FROM users
WHERE subscription_status = 'active'
  AND subscription_expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
```
Для каждого — отправить сообщение:
```
⚠️ Анна, подписка истекает через 3 дня.

После окончания будут доступны только 3 привычки.

[Продлить за 100 ₽]
```

### Что происходит после истечения

Cron раз в сутки (в 01:00):
```sql
UPDATE users SET
    subscription_status = 'expired',
    habits_limit = 3
WHERE subscription_status = 'active'
  AND subscription_expires_at < NOW()
```

Бот пишет пользователю:
```
Анна, подписка закончилась.

Твои данные и история в сохранности.
Доступны первые 3 привычки из списка.

[Продлить за 100 ₽]
```

---

## 13. Что меняется на фронтенде

После разработки бэкенда в `tg-app/index.html` нужно:

### 1. Добавить функцию запроса к API

```js
async function api(method, path, body) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
            'Authorization': `tg-initdata ${window.Telegram.WebApp.initData}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        const err = await res.json();
        throw err;
    }
    return res.json();
}
```

### 2. Убрать localStorage как основное хранилище

localStorage оставить только как кэш для быстрого старта (skeleton), данные — всегда с сервера.

### 3. Добавить отображение онбординга

При `user.is_onboarded === false` — показать 3 слайда онбординга перед главным экраном.

### 4. Добавить экран "Помощь" в настройках

Кнопка "Как пользоваться?" → bottom sheet с инструкцией.

### 5. Добавить UI подписки в настройки

```
ПОДПИСКА
┌──────────────────────────────┐
│ 💎 Статус: Бесплатный       │
│ Привычки: 2 из 3            │
│                              │
│ [Оформить за 100 ₽/мес]     │
└──────────────────────────────┘
```

### 6. Константа API_BASE_URL

```js
const API_BASE_URL = 'https://your-backend.render.com'; // или Railway
```

---

## 14. Порядок разработки

### Этап 1: База данных + авторизация (1–2 дня)

1. Создать проект на Supabase → получить `DATABASE_URL`
2. Выполнить SQL-миграции (файлы из `src/db/migrations/`)
3. Инициализировать Express-проект в папке `backend/`
4. Подключить `pg` (node-postgres) + настроить пул
5. Реализовать `authMiddleware` с HMAC-SHA256
6. `POST /api/users/me` — первый рабочий endpoint
7. Протестировать: отправить запрос с реальным `initData` из Telegram

### Этап 2: CRUD привычек + выполнения (2–3 дня)

8. `GET /api/habits` — список с streak и is_done_today
9. `POST /api/habits` — создание, с проверкой лимита
10. `PATCH /api/habits/:id` — редактирование
11. `DELETE /api/habits/:id` — архивирование
12. `POST /api/completions` — отметить выполненной
13. `DELETE /api/completions` — снять отметку
14. Подключить фронтенд к API (заменить localStorage)

### Этап 3: Напоминания (1–2 дня)

15. Установить `node-cron`, подключить Telegraf
16. Реализовать cron-задачу `/src/cron/reminders.js`
17. Протестировать: поставить напоминание на ближайшую минуту, убедиться что пришло

### Этап 4: Бот + достижения (1 день)

18. Команды `/start`, `/help`, `/stats`
19. Логика достижений: `checkAchievements()` после каждого `POST /api/completions`
20. Cron еженедельного итога (воскресенье, 20:00)

### Этап 5: Монетизация (1–2 дня)

21. Зарегистрировать ЮKassa в @BotFather → получить `PAYMENT_PROVIDER_TOKEN`
22. `POST /api/subscription/invoice` + обработчики `pre_checkout_query` / `successful_payment`
23. UI подписки в настройках Mini App
24. Cron напоминания о продлении + Cron истечения подписок

### Этап 6: Онбординг + инструкция (1 день)

25. 3 слайда онбординга в фронтенде
26. Экран "Помощь" в настройках
27. Расширенный текст в `/start` и `/help`

### Этап 7: Перенос на Railway (когда нужно)

28. Создать проект на Railway, подключить GitHub-репозиторий
29. Перенести PostgreSQL с Supabase → Railway (или оставить Supabase)
30. Обновить `DATABASE_URL` в переменных Railway
31. Обновить `API_BASE_URL` на фронтенде

---

## 15. Хостинг: текущий и будущий

### Сейчас (бесплатно)

| Сервис | Что | Лимиты |
|---|---|---|
| Vercel | Фронтенд (tg-app/index.html) | Без лимитов для статики |
| Render | Бэкенд (Express + бот + cron) | 512MB RAM, 0.1 CPU, бесплатно |
| Supabase | PostgreSQL | 500MB, 2 проекта, бесплатно |

**Важно:** Render в бесплатном тире может засыпать при отсутствии HTTP-запросов. Решение: UptimeRobot (бесплатно) — пинговать `GET /health` каждые 5 минут. Добавить endpoint:
```js
app.get('/health', (req, res) => res.json({ ok: true }));
```

### Потом (надёжно, ~$10/мес)

| Сервис | Что | Цена |
|---|---|---|
| Vercel | Фронтенд | Бесплатно |
| Railway | Бэкенд | ~$5/мес |
| Railway | PostgreSQL | ~$5/мес |

Railway: автодеплой из GitHub, нет засыпаний, встроенные метрики.

---

## 16. Чеклист готовности к деплою

- [ ] Все переменные из `.env.example` заполнены в `.env` продакшн-окружения
- [ ] HMAC-SHA256 верификация работает (проверить с реальным initData)
- [ ] Cron-напоминание отправлено в нужное время (ручной тест)
- [ ] Оплата прошла тест через ЮKassa в тестовом режиме
- [ ] Обработчик ошибки 403 (бот заблокирован) в cron не роняет процесс
- [ ] SQL индексы созданы (особенно на `completions`)
- [ ] Лимит привычек для free-тира работает (попытка добавить 4-ю → ошибка)
- [ ] Архивирование, а не DELETE для привычек
- [ ] `GET /health` отвечает 200 (для UptimeRobot)
- [ ] Секреты не попали в git (`.env` в `.gitignore`)
