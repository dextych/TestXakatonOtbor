# Kubok — Полная техническая документация по backend

---

## 1. Полная механика игры

### Жизненный цикл комнаты (State Machine)


SCHEDULED → WAITING → ROUND_1 → BOOST_DECISION_1 → BOOST_WINDOW_1
         → ROUND_2 → BOOST_DECISION_2
         → BOOST_WINDOW_2 → FINISHED


### Таймлайн фаз

| Фаза | Длительность | Статус | Действия |
|------|-------------|--------|---------|
| Ожидание игроков | 60 сек | WAITING | Вход, система добавляет ботов при нехватке, таймер → ROUND_1 |
| Выбор бочек | 30 сек | ROUND_1 | Игроки выбирают бочки, RNG seed зафиксирован (hash публичен) |
| Решение о бусте | 5 сек | BOOST_DECISION_1 | Окно для принятия решения |
| Окно буста | 5 сек | BOOST_WINDOW_1 | Seed раскрыт, веса опубликованы |
| Финальный раунд | 30+5+5 сек | ROUND_2`/`BOOST_DECISION_2`/`BOOST_WINDOW_2 | Финальный скоринг, распределение призов |

---

### Механика резерва

1. В фазе WAITING у игрока резервируется сумма entry fee из доступного баланса
2. Поле gameParticipants.reservedPoints (BigDecimal 12,2) — факт резервирования
3. Баланс операции: RESERVE (доступный → зарезервированный) через Kafka async
4. При проигрыше: DEDUCT_RESERVED — списание с зарезервированного
5. При победе: AWARD — зачисление приза + возврат зарезервированного

---

### Механика ботов (`BotServiceImpl`)

- Метод: createBotsForRoom(UUID roomId, int count, BigDecimal entryFeeAmount)
- Имена: "Бот 1", "Бот 2" и т.д.
- Нормальный режим — SecureRandom shuffled, случайный выбор
- Режим защиты (если системный баланс отрицательный) — боты выбирают бочки с наибольшим весом, снижая шансы игрока

Боты участвуют в обоих раундах, если проходят в финал. Создаются с reservedPoints = entryFee.

---

### Механика буста

- Стоимость: конфигурируемая (`gameRoomConfig.boostCostAmount`)
- Лимит: 1 буст за всю игру (нельзя в обоих раундах)
- Оплата: асинхронно через Kafka outbox (`BALANCE_DEDUCT`)

Алгоритм эффекта (`RoundScoringUtils.computeBoostEffect`):
- Если есть отрицательные веса → инвертируем самый отрицательный (например, -8 → +8)
- Если все положительные → удваиваем минимальный положительный

---

### Бочки и генерация весов

- 12 бочек на раунд: R1B01`–`R1B12, R2B01`–`R2B12
- Веса: диапазон [-10, +10], генерация через SHA-256 хэш-цепочку
- Provably Fair: seed зафиксирован (commit) до выбора → раскрыт (reveal) после
- Перемешивание для каждого игрока: детерминированный shuffle (userId.MSB ^ userId.LSB) ^ (roundNumber << 32)

---

### Алгоритм выбора победителя

1. Основной критерий — наибольшая сумма весов выбранных бочек (`SCORE`)
2. Тайбрейк 2 — более ранний timestamp отправки (`TIMESTAMP_TIEBREAK`)

Поле winCriteria в GameFinishedEvent указывает, по какому критерию победа.

---

## 2. Экономическая модель и конфигуратор

### Параметры конфигурации (`gameRoomConfig`)

| Параметр | Тип | Пример |
|----------|-----|--------|
| maxPlayers | int | 4, 8, 16 |
| entryFeeAmount | BigDecimal(12,2) | 50.00 |
| winnerPayoutPercentage | BigDecimal(5,2) | 70.00 (70%) |
| boostCostAmount | BigDecimal(12,2) | 10.00 |
| isBoostEnabled | boolean | true |
| maxBarrelSelection | int (1-10) | 5 |
| scheduledStartAt | TIMESTAMPTZ | опционально |
| repeatInterval | VARCHAR | DAILY / WEEKLY / MONTHLY |

---

### Расчёт призового фонда (`PrizeServiceImpl.distributePrize`)


Пример: 4 игрока, entry fee 50.00, payout 70%

Призовой фонд        = 50.00 × 4        = 200.00
Выплата победителю   = 200.00 × 70%     = 140.00
Доход системы        = 200.00 - 140.00  =  60.00 (30%)


---

### Аналитика (`gameHistory`)

| Поле | Назначение |
|------|-----------|
| prizeAwarded | Выплачено победителю |
| systemRevenue | Доход платформы |
| realPlayersCount | Живые игроки |
| botCount | Кол-во ботов |
| realPlayersRevenue | Сборы с живых игроков |
| boostRevenue | Доход от буста |
| boostUsedCount | Сколько игроков купили буст |
| winnerUsedBoost | Использовал ли победитель буст |

---

### Конфигуратор (`GameRoomConfigValidator.evaluate`)

| Код | Уровень | Условие |
|-----|---------|---------|
| LOW_PLAYER_PAYOUT | WARN | Payout < 50% |
| LOW_ORGANIZER_REVENUE | WARN | Payout > 95% |
| BOOST_TOO_EXPENSIVE | WARN | Boost > Entry Fee |
| BOOST_CONFIG_INCONSISTENT | ERROR | Boost выключен, но цена > 0 |
| LOW_SELECTION_CHOICE | WARN | maxBarrelSelection = 1 |
| SMALL_ROOM | INFO | maxPlayers = 2 |

Рейтинг привлекательности конфига:
- HIGH — payout ≥70% + boost ≤50% entry + нет предупреждений
- MEDIUM — высокий payout + доступный boost + есть предупреждения
- LOW — есть ошибки, или низкий payout / дорогой boost

Финансовые метрики:
- expectedValue = (prizePool / maxPlayers) − entryFee
- systemRevenuePct = systemRevenue / totalPool × 100

---

## 3. Backend, Real-Time и архитектура

### Два сервиса

| Сервис | Порт | Ответственность |
|--------|------|----------------|
| stoloto-core | 8080 | Auth, балансы, Kafka consumer, WebSocket relay |
| bonus-game-service | 8081 | Комнаты, раунды, скоринг, Quartz, Kafka publisher |

### WebSocket (STOMP) топики

| Топик | Назначение |
|-------|-----------|
| /topic/rooms | Глобальные события комнат (`ROOM_CREATED`, ROOM_FINISHED, `ROOM_FULL`) |
| /topic/room/{roomId} | Обновления комнаты (`PLAYER_JOINED`) |
| /topic/room/{roomId}/round | Раундовые события (`ROUND_STARTED`, WEIGHTS_REVEALED, `ROUND_COMPLETED`) |
| /topic/room/{roomId}/game | Игровые события (`GAME_FINISHED`, `FINALISTS_ANNOUNCED`) |
| /queue/game/{roomId} | Персональные бочки (уникальный шаффл на игрока) |
| /queue/balance | Обновление баланса пользователя |

### Kafka топики

| Топик | Event | Payload |
|-------|-------|---------|
| game.finished | GameFinishedEvent | roomId, winnerId, winnerIsBot, prizePool, prizeAwarded, winCriteria |
| game.entry.reserved | GameEntryReservedEvent | userId, roomId, amount |
| balance.command | BalanceCommandEvent | commandType, userId, amount, roomId |
| game.ws.event | Outbox wrapper | destination, userId, payload |

commandType: RESERVE, RELEASE, AWARD, DEDUCT, DEDUCT_RESERVED

---

### Transactional Outbox Pattern


Таблица: game.outbox_events
  id, aggregate_type, aggregate_id, event_type,
  topic, payload (JSON), status (PENDING/PROCESSED/FAILED),
  created_at, processed_at

OutboxProcessor (@Scheduled, fixedDelay 500ms):
  → fetchPending(50 events)
  → kafkaTemplate.send(topic, aggregateId, payload)
  → markProcessed / markFailed


Гарантия: событие записывается в одной транзакции с бизнес-данными. При rollback — нет события.

---

### Quartz Jobs

| Job | Триггер | Действие |
|-----|---------|---------|
| FillWithBotsJob | waitTimerExpiresAt + 60s | Добавить ботов, старт Round 1 |
| ResolveRoundJob | roundStart + 30s | Раскрыть seed, назначить веса |
| BoostWindowStartJob | boostDecision + 5s | Войти в окно буста |
| FinalizeRoundJob | boostWindow + 5s | Скоринг, призы, публикация |
| StartRound2Job | finalists timeout + 15s | Автостарт Round 2 |
| OpenScheduledRoomJob | scheduledStartAt | Открыть SCHEDULED → WAITING, создать следующий |

---

### Idempotency ключи балансовых операций


RESERVE:userId:roomId
AWARD:userId:roomId
BOOST_DEDUCT:userId:roomId
DEDUCT_RESERVED:userId:roomId


Дублирующий запрос с тем же ключом игнорируется — безопасно при повторной доставке Kafka.

---

## 4. Встраиваемость в контур СТОЛОТО

### Аутентификация

- Внешние запросы: JWT Bearer (HS256, 24ч, `${JWT_SECRET}`)
  - Claims: sub (userId UUID), roles, username
  - Валидация: AuthTokenFilter → JwtUtils.validateToken
- Внутренние вызовы: заголовок X-Internal-Secret (`${INTERNAL_SECRET}`)
  - Только между сервисами, не экспонируется наружу

### Internal API (Core ← Game Service)


POST /internal/balance/reserve
POST /internal/balance/release
POST /internal/balance/award
POST /internal/balance/deduct
POST /internal/balance/deduct-reserved
GET  /internal/balance/{userId}      → { available, reserved }
GET  /internal/users/{userId}        → { id, username }


Запрос: { "userId": UUID, "amount": Decimal, "roomId": UUID }

### Интеграционная схема


Игрок → JWT → bonus-game-service
  ├─ Sync HTTP (X-Internal-Secret) → stoloto-core /internal/balance
  ├─ Async Kafka (outbox) → balance.command → stoloto-core consumer
  └─ WebSocket STOMP (JWT) → stoloto-core WsEventRelay → клиент


### Public API эндпоинты


# Game Service
POST   /api/v1/game/rooms                          — создание комнаты (ADMIN)
GET    /api/v1/game/rooms                          — список с фильтрами
GET    /api/v1/game/rooms/affordable               — комнаты по балансу игрока
GET    /api/v1/game/rooms/suggest                  — рекомендация комнаты
POST   /api/v1/game/rooms/admin/evaluate           — оценка конфига (ADMIN)
DELETE /api/v1/game/rooms/admin/{roomId}           — отмена комнаты (ADMIN)
POST   /api/v1/game/rooms/{roomId}/join            — вход в комнату

POST   /api/v1/game/rooms/{roomId}/rounds/{n}/selection — выбор бочек
POST   /api/v1/game/rooms/{roomId}/rounds/{n}/boost     — покупка буста
GET    /api/v1/game/rooms/{roomId}/rounds/{n}/result    — результат раунда
GET    /api/v1/game/rooms/{roomId}/rounds/{n}/verify    — Provably Fair верификация
POST   /api/v1/game/rooms/{roomId}/rounds/2/ready       — готовность к Round 2

# Core Service
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/balance


---

## 5. Масштабируемость и развитие продукта

### Текущие характеристики

| Параметр | Значение |
|----------|---------|
| DB connection pool | 25 max / 5 min (HikariCP) |
| Outbox batch | 50 событий / 500ms polling |
| Hibernate batch inserts | 50 записей |
| Kafka outbox batch | 50 / 2000ms |
| Quartz threads | 10 |

### Масштабирование

Горизонтальное масштабирование:
- Quartz: isClustered=false сейчас → isClustered=true + PostgreSQLDelegate для HA
- Outbox + idempotency keys: безопасен при нескольких инстансах
- Kafka: естественная буферизация пиков нагрузки
- Stateless REST API: готов к LB без липких сессий

Разделение БД по схемам:
- core.* — пользователи, балансы, транзакции
- game.* — комнаты, раунды, участники, outbox, аудит

Оптимизации БД:

idx_outbox_status (status)                        — быстрый polling pending
idx_gameParticipants_gameRoomId_userId
idx_barrels_gameRoomId_roundNumber
idx_participantRoundEntries_roundResultId


### Ключевые технические преимущества

| Фича | Реализация |
|------|-----------|
| Provably Fair | SHA-256 commit-reveal, верифицируемый пользователем |
| Idempotency | Все балансовые операции с idempotency ключами |
| Transactional Outbox | Атомарность: бизнес-данные + событие в одной транзакции |
| WebSocket защита | JWT-валидация при handshake STOMP |
| Bot защита баланса | Режим защиты при отрицательном системном балансе |
| Recurring rooms | OpenScheduledRoomJob автосоздаёт следующий цикл |
| Audit trail | gameEventLog + pointTransactions — полная история |
| Config validation | Оценка привлекательности + финансовые метрики до публикации |

### Пути развития

- Multi-room tournaments: уже есть SCHEDULED + repeatInterval — можно строить серии
- A/B тестирование конфигов: evaluate endpoint даёт метрики до запуска
- Аналитика: gameHistory содержит все KPI (boostRevenue, systemRevenue, realPlayersCount)
- Fraud detection: idempotency log + gameEventLog — полный аудит каждого действия
- Clustering: Quartz + Kafka готовы к кластеризации без изменений архитектуры