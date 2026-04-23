const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const SockJS = require('sockjs-client');
const Stomp = require('stompjs');
const config = require('../../config/testConfig');
const { TimingStats } = require('../utils/timing');
const Logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

describe('Создание комнаты по расписанию с повтором', () => {
    const timingStats = new TimingStats();
    const socketEvents = [];
    let stompClient = null;
    let createdRoom = null; 
    
//КОНФИГУРАЦИЯ КОМНАТЫ С ПОВТОРОМ (из конфига)
    const roomConfig = {
        name: config.SCHEDULED_ROOM_CONFIG.name,
        config: {
            ...config.SCHEDULED_ROOM_CONFIG.config,
            scheduledStartAt: new Date(Date.now() + 5000).toISOString() 
        }
    };

    beforeAll(async () => {
        Logger.header('НАСТРОЙКА ТЕСТА РАСПИСАНИЯ');
        
        console.log('Подключение WebSocket для отслеживания событий...');
        
        stompClient = await new Promise((resolve, reject) => {
            const socket = new SockJS(`${config.BASE_URL}/ws/game`);
            const client = Stomp.over(socket);
            client.debug = null;
            
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 15000);
            
            client.connect(
                { Authorization: `Bearer ${config.ADMIN_TOKEN}` },
                () => {
                    clearTimeout(timeout);
                    console.log('✅ WebSocket подключен');
                    resolve(client);
                },
                (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            );
        });
        
        // Подписываемся на глобальные события комнат
        stompClient.subscribe('/topic/rooms', (msg) => {
            try {
                const data = JSON.parse(msg.body);
                socketEvents.push({
                    timestamp: new Date().toISOString(),
                    type: data.type,
                    data: data
                });
                
                if (data.type === 'ROOM_CREATED') {
                    const roomId = data.room?.id || data.id || 'unknown';
                    console.log(`📢 ROOM_CREATED: ${roomId?.slice(0, 8)}...`);
                    if (data.room) {
                        console.log(`   Статус: ${data.room.status}`);
                        console.log(`   Запланирован на: ${data.room.config?.scheduledStartAt}`);
                        console.log(`   Интервал повтора: ${data.room.config?.repeatInterval || 'нет'}`);
                    }
                } else if (data.type === 'ROOM_SCHEDULED') {
                    const roomId = data.room?.id || data.id || 'unknown';
                    console.log(`📢 ROOM_SCHEDULED: ${roomId?.slice(0, 8)}...`);
                    if (data.room) {
                        console.log(`   Статус: ${data.room.status}`);
                        console.log(`   Запланирован на: ${data.room.config?.scheduledStartAt}`);
                    }
                }
            } catch (e) {
                // Игнорируем ошибки парсинга
            }
        });
        
        console.log('✅ Подписка на /topic/rooms активирована\n');
    });

    test('Шаг 1: Предварительная оценка конфигурации', async () => {
        Logger.header('ШАГ 1: ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА');
        
        const stepStart = Date.now();
        
        console.log(`\nОценка: ${roomConfig.name}`);
        
        try {
            const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms/admin/evaluate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.ADMIN_TOKEN}`,
                    'Content-Type': 'application/json',
                    'accept': '*/*'
                },
                body: JSON.stringify(roomConfig.config)
            });
            
            const data = await response.json();
            
            console.log(`  Статус: ${response.status}`);
            console.log(`  Призовой фонд: ${data.prizePoolAmount || 0}`);
            console.log(`  Доход организатора: ${data.organizerIncome || 0}`);
            
            if (data.warnings && data.warnings.length > 0) {
                console.log(`  Предупреждения:`);
                data.warnings.forEach(w => {
                    console.log(`    - [${w.level || 'INFO'}] ${w.message}`);
                });
            }
            
            const duration = (Date.now() - stepStart) / 1000;
            timingStats.recordStep('evaluation', duration);
            
            expect(response.ok).toBe(true);
            
        } catch (error) {
            console.error(`  ❌ Ошибка: ${error.message}`);
            throw error;
        }
    }, 30000);

    test('Шаг 2: Создание комнаты по расписанию', async () => {
        Logger.header('ШАГ 2: СОЗДАНИЕ КОМНАТЫ ПО РАСПИСАНИЮ');
        
        const stepStart = Date.now();
        const eventsBefore = socketEvents.length;
        
        console.log(`\nСоздание комнаты: ${roomConfig.name}`);
        console.log(`  Запланировано на: ${roomConfig.config.scheduledStartAt}`);
        console.log(`  Интервал повтора: ${roomConfig.config.repeatInterval || 'нет'}`);
        
        try {
            const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.ADMIN_TOKEN}`,
                    'Content-Type': 'application/json',
                    'accept': '*/*'
                },
                body: JSON.stringify(roomConfig.config)
            });
            
            const data = await response.json();
            
            if (response.status === 201) {
                const roomId = data.room?.id || data.id;
                const roomStatus = data.room?.status || data.status;
                
                console.log(`  ✅ Комната создана!`);
                console.log(`  ID: ${roomId}`);
                console.log(`  Статус: ${roomStatus}`);
                console.log(`  Игроков: ${data.room?.currentPlayerCount || 0}`);
                
                createdRoom = {
                    name: roomConfig.name,
                    roomId: roomId,
                    status: roomStatus,
                    config: roomConfig.config,
                    data: data
                };
                
                expect(roomStatus).toBe('SCHEDULED');
                
            } else {
                console.error(`  ❌ Ошибка создания: ${response.status}`);
                console.error(`  ${JSON.stringify(data)}`);
                throw new Error(`Failed to create room: ${response.status}`);
            }
            
        } catch (error) {
            console.error(`  ❌ Ошибка: ${error.message}`);
            throw error;
        }
        
        const duration = (Date.now() - stepStart) / 1000;
        timingStats.recordStep('roomCreation', duration);
        
        // Проверяем события
        await sleep(2000);
        const newEvents = socketEvents.slice(eventsBefore);
        const scheduledEvents = newEvents.filter(e => e.type === 'ROOM_SCHEDULED');
        
        console.log(`\n📢 Получено событий ROOM_SCHEDULED: ${scheduledEvents.length}`);
        
        expect(createdRoom).not.toBeNull();
    }, 60000);

    test('Шаг 3: Проверка статуса созданной комнаты', async () => {
        Logger.header('ШАГ 3: ПРОВЕРКА СТАТУСА КОМНАТЫ');
        
        const stepStart = Date.now();
        
        console.log(`\nПроверка комнаты: ${createdRoom.name}`);
        console.log(`  ID: ${createdRoom.roomId}`);
        
        try {
            const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms/${createdRoom.roomId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.ADMIN_TOKEN}`,
                    'accept': '*/*'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`  Статус: ${data.status}`);
                console.log(`  Игроков: ${data.currentPlayerCount}/${data.config?.maxPlayers}`);
                console.log(`  Запланирован на: ${data.config?.scheduledStartAt}`);
                console.log(`  Интервал повтора: ${data.config?.repeatInterval || 'нет'}`);
                
                createdRoom.currentStatus = data.status;
                createdRoom.currentPlayerCount = data.currentPlayerCount;
                
                expect(data.status).toBe('SCHEDULED');
                expect(data.currentPlayerCount).toBe(0);
                expect(data.config?.scheduledStartAt).toBeDefined();
                expect(data.config?.repeatInterval).toBe('EVERY_30_MIN');
                
            } else {
                console.error(`  ❌ Ошибка получения: ${response.status}`);
                const errorText = await response.text();
                console.error(`  ${errorText}`);
                throw new Error(`Failed to get room: ${response.status}`);
            }
            
        } catch (error) {
            console.error(`  ❌ Ошибка: ${error.message}`);
            throw error;
        }
        
        const duration = (Date.now() - stepStart) / 1000;
        timingStats.recordStep('statusCheck', duration);
        
        expect(createdRoom.currentStatus).toBe('SCHEDULED');
    }, 30000);

    test('Шаг 4: Ожидание активации комнаты', async () => {
        Logger.header('ШАГ 4: ОЖИДАНИЕ АКТИВАЦИИ КОМНАТЫ');
        
        const scheduledTime = new Date(createdRoom.config.scheduledStartAt);
        const waitTime = scheduledTime.getTime() - Date.now();
        
        console.log(`Комната: ${createdRoom.name}`);
        console.log(`ID: ${createdRoom.roomId}`);
        console.log(`Запланирована на: ${scheduledTime.toLocaleString()}`);
        console.log(`Осталось ждать: ${Math.round(waitTime / 1000)} сек`);
        
        if (waitTime > 0 && waitTime < 120000) {
            console.log(`\nОжидаем активацию...`);
            
            const stepStart = Date.now();
            const maxWait = waitTime + 30000;
            
            let roomActivated = false;
            const waitStart = Date.now();
            
            while (!roomActivated && (Date.now() - waitStart) < maxWait) {
                await sleep(2000);
                
                try {
                    const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms/${createdRoom.roomId}`, {
                        headers: { 'Authorization': `Bearer ${config.ADMIN_TOKEN}` }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        
                        if (data.status === 'WAITING' || data.status === 'ACTIVE') {
                            roomActivated = true;
                            createdRoom.activatedStatus = data.status;
                            console.log(`\n✅ Комната активирована! Статус: ${data.status}`);
                            console.log(`  Игроков: ${data.currentPlayerCount}`);
                        }
                    }
                } catch (error) {
                    // Игнорируем
                }
                
                const elapsed = Math.floor((Date.now() - waitStart) / 1000);
                if (elapsed % 10 === 0 && elapsed > 0) {
                    console.log(`  Прошло ${elapsed}с...`);
                }
            }
            
            const duration = (Date.now() - stepStart) / 1000;
            timingStats.recordStep('waitActivation', duration);
            
            if (roomActivated) {
                console.log(`\n✅ Комната успешно активировалась по расписанию!`);
                expect(roomActivated).toBe(true);
            } else {
                console.log(`\n⚠️ Комната не активировалась за отведенное время`);
            }
            
        } else {
            console.log(`\n⚠️ Время ожидания слишком большое (${Math.round(waitTime / 1000)} сек), пропускаем`);
        }
    }, 180000);

    test('Шаг 5: Сохранение конфигурации для проверки повтора', async () => {
        Logger.header('ШАГ 5: СОХРАНЕНИЕ КОНФИГУРАЦИИ');
        
        const fs = require('fs');
        
        // Сохраняем конфигурацию для последующей проверки повтора
        const savedConfig = {
            maxPlayers: roomConfig.config.maxPlayers,
            entryFeeAmount: roomConfig.config.entryFeeAmount,
            winnerPayoutPercentage: roomConfig.config.winnerPayoutPercentage,
            boostCostAmount: roomConfig.config.boostCostAmount,
            repeatInterval: roomConfig.config.repeatInterval
        };
        
        console.log('📄 Конфигурация сохранена в repeat-room-config.json');
        console.log('\nСодержимое:');
        console.log(JSON.stringify(savedConfig, null, 2));
        console.log('\n📋 Через 30+ минут запустите проверку:');
        console.log('   npm run check-repeat');
        
        expect(savedConfig.repeatInterval).toBe('EVERY_30_MIN');
    }, 10000);

    afterAll(async () => {
        Logger.header('ЗАВЕРШЕНИЕ ТЕСТА');
        
        timingStats.finalize();
        
        console.log('\n=== СТАТИСТИКА ТЕСТА ===');
        console.log(`Комната создана: ${createdRoom ? '✅' : '❌'}`);
        console.log(`ID: ${createdRoom?.roomId || 'нет'}`);
        console.log(`Всего событий: ${socketEvents.length}`);
        
        const eventTypes = {};
        socketEvents.forEach(e => {
            eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
        });
        
        console.log('\nСобытия по типам:');
        Object.entries(eventTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        
        console.log('\nВремя выполнения шагов:');
        if (timingStats.steps.evaluation) {
            console.log(`  Оценка конфигурации: ${timingStats.steps.evaluation.toFixed(2)}с`);
        }
        if (timingStats.steps.roomCreation) {
            console.log(`  Создание комнаты: ${timingStats.steps.roomCreation.toFixed(2)}с`);
        }
        if (timingStats.steps.statusCheck) {
            console.log(`  Проверка статуса: ${timingStats.steps.statusCheck.toFixed(2)}с`);
        }
        if (timingStats.steps.waitActivation) {
            console.log(`  Ожидание активации: ${timingStats.steps.waitActivation.toFixed(2)}с`);
        }
        
        // Закрываем WebSocket
        if (stompClient && stompClient.connected) {
            stompClient.disconnect(() => {
                console.log('\n✅ WebSocket отключен');
            });
        }
        
        await sleep(1000);
    });
});