-- =============================================================
-- МИГРАЦИЯ 006: Таблица платежей
-- =============================================================
-- Метафора: это "кассовая книга".
-- Каждый платёж записывается сюда — даже неуспешные.
-- Это важно: если пользователь говорит "я платил, но подписка не активна" —
-- мы смотрим сюда и находим причину.
--
-- Никогда не удаляем строки из этой таблицы.
-- =============================================================

CREATE TABLE IF NOT EXISTS payments (
    id                          SERIAL PRIMARY KEY,

    user_id                     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Сумма в рублях
    amount                      INTEGER NOT NULL,
    currency                    TEXT NOT NULL DEFAULT 'RUB',

    -- Уникальный ID транзакции от Telegram Payments
    -- Нужен для подтверждения: если Telegram пришлёт дубль — игнорируем
    telegram_payment_charge_id  TEXT UNIQUE,

    -- ID транзакции от платёжного провайдера (ЮKassa)
    provider_payment_charge_id  TEXT,

    -- Статус платежа
    -- 'pending' — ждём подтверждения
    -- 'success' — оплачено, подписка активирована
    -- 'failed'  — что-то пошло не так
    status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'success', 'failed')),

    -- Период подписки, который оплачен этим платежом
    period_start                TIMESTAMP WITH TIME ZONE,
    period_end                  TIMESTAMP WITH TIME ZONE,   -- period_start + 30 дней

    created_at                  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
