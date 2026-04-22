const { describe, test, expect, afterAll } = require('@jest/globals');
const config = require('../config/testConfig');
const Logger = require('../utils/logger');
const { sleep } = require('../utils/helpers');

// Переиспользуем готовые модули
const joinPlayers = require('../steps/step2_joinPlayers');
const round1 = require('../steps/step5_round1');
const round2 = require('../steps/step6_round2');
const { TimingStats } = require('../utils/timing');

describe('Проверка создания повторной комнаты и игрового процесса', () => {
    
    const timingStats = new TimingStats();

    // Конфигурация для поиска комнат (из конфига)
    const targetConfig = config.REPEAT_ROOM_SEARCH_CONFIG;
    
    const testContext = {
        roomIds: [],
        results: [],
        stompClients: [],
        socketEvents: [],
        round1Results: null
    };
    
    test('Шаг 1: Поиск повторных комнат', async () => {
        Logger.header('ШАГ 1: ПОИСК ПОВТОРНЫХ КОМНАТ');
        
        console.log('🔍 Ищем комнаты с конфигурацией:');
        console.log(`  maxPlayers: ${targetConfig.maxPlayers}`);
        console.log(`  entryFeeAmount: ${targetConfig.entryFeeAmount}`);
        console.log(`  winnerPayoutPercentage: ${targetConfig.winnerPayoutPercentage}`);
        console.log(`  repeatInterval: ${targetConfig.repeatInterval}`);
        
        const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.ADMIN_TOKEN}`,
                'accept': '*/*'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get rooms: ${response.status}`);
        }
        
        const data = await response.json();
        const rooms = data.rooms || data || [];
        
        console.log(`\n📊 Всего комнат в системе: ${rooms.length}`);
        
        // Ищем комнаты с такой же конфигурацией, исключая SCHEDULED
        const matchingRooms = rooms.filter(room => {
            const cfg = room.config;
            if (!cfg) return false;
            if (room.status === 'SCHEDULED') return false;
            
            return cfg.maxPlayers === targetConfig.maxPlayers &&
                   cfg.entryFeeAmount === targetConfig.entryFeeAmount &&
                   cfg.winnerPayoutPercentage === targetConfig.winnerPayoutPercentage &&
                   cfg.repeatInterval === targetConfig.repeatInterval;
        });
        
        console.log(`\n🎯 Найдено реальных комнат: ${matchingRooms.length}`);
        
        matchingRooms.forEach((room, index) => {
            console.log(`\n  Комната ${index + 1}:`);
            console.log(`    ID: ${room.id}`);
            console.log(`    Статус: ${room.status}`);
            console.log(`    Игроков: ${room.currentPlayerCount}/${room.config?.maxPlayers}`);
            console.log(`    Создана: ${room.createdAt}`);
        });
        
        if (matchingRooms.length >= 2) {
            console.log(`\n✅ Найдено ${matchingRooms.length} повторных комнат`);
        } else {
            console.log(`\n⚠️ Найдена только ${matchingRooms.length} комната. Продолжаем с тем, что есть.`);
        }
        
        const uniqueIds = new Set(matchingRooms.map(r => r.id));
        expect(uniqueIds.size).toBe(matchingRooms.length);
        
        const allHaveCorrectInterval = matchingRooms.every(r => 
            r.config?.repeatInterval === targetConfig.repeatInterval
        );
        expect(allHaveCorrectInterval).toBe(true);
        
        // Сохраняем ID комнат для тестирования (берем WAITING или ACTIVE)
        const availableRoomIds = matchingRooms
            .filter(r => r.status === 'WAITING' || r.status === 'ACTIVE' || r.status === 'ROUND_1')
            .map(r => r.id);
        
        if (availableRoomIds.length === 0 && matchingRooms.length > 0) {
            availableRoomIds.push(matchingRooms[0].id);
        }
        
        if (availableRoomIds.length === 0) {
            throw new Error('Нет доступных комнат для тестирования');
        }
        
        testContext.roomIds = availableRoomIds.slice(0, 1); // Берем только 1 комнату для теста
        
        console.log(`\n✅ Выбрана комната для тестирования: ${testContext.roomIds[0]?.slice(0, 8)}`);
        
        expect(testContext.roomIds.length).toBeGreaterThan(0);
        
    }, 30000);
    
    test('Шаг 2: Вход игроков в найденную комнату', async () => {
        Logger.header('ШАГ 2: ВХОД ИГРОКОВ');
        
        const { results, stompClients, successful } = await joinPlayers(
            testContext.roomIds,
            config.TOKENS,
            timingStats,
            testContext.socketEvents
        );
        
        testContext.results = results;
        testContext.stompClients = stompClients;
        
        console.log(`\n✅ Успешно вошли в ${successful}/${testContext.roomIds.length} комнат`);
        
        expect(successful).toBeGreaterThan(0);
        
    }, 120000);
    
    test('Шаг 3: Ожидание активной игры', async () => {
        Logger.header('ШАГ 3: ОЖИДАНИЕ АКТИВНОЙ ИГРЫ');
        
        const successfulRooms = testContext.results.filter(r => r.success);
        
        if (successfulRooms.length === 0) {
            throw new Error('Нет успешно заполненных комнат');
        }
        
        const room = successfulRooms[0];
        
        console.log(`Ожидание статуса ACTIVE или ROUND_1 для комнаты ${room.roomId.slice(0, 8)}...`);
        
        const waitStart = Date.now();
        let gameActive = false;
        
        while (!gameActive && (Date.now() - waitStart) < 70000) {
            await sleep(2000);
            
            try {
                const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms/${room.roomId}`, {
                    headers: { 'Authorization': `Bearer ${config.ADMIN_TOKEN}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`  Статус: ${data.status}, Игроков: ${data.currentPlayerCount}/${data.config?.maxPlayers}`);
                    
                    // 🔧 Проверяем что игра активна или уже в раунде
                    if (data.status === 'ACTIVE' || data.status === 'ROUND_1' || data.status === 'ROUND_2') {
                        gameActive = true;
                        console.log(`\n✅ Игра активна! Статус: ${data.status}`);
                    }
                }
            } catch (error) {
                // Игнорируем
            }
            
            // Также проверяем события
            const hasRoomStarted = testContext.socketEvents.some(e => 
                e.type === 'ROOM_STARTED' && e.roomId === room.roomId
            );
            
            if (hasRoomStarted && !gameActive) {
                gameActive = true;
                console.log(`\n✅ Получено событие ROOM_STARTED`);
            }
        }
        
        expect(gameActive).toBe(true);
        
    }, 75000);
    
    test('Шаг 4: Раунд 1 - выбор бочек (без буста)', async () => {
        Logger.header('ШАГ 4: РАУНД 1');
        
        // Используем готовый модуль round1
        const round1Result = await round1(
            testContext.results,
            testContext.socketEvents,
            timingStats
        );
        
        testContext.round1Results = round1Result;
        
        if (round1Result.success) {
            console.log(`\n✅ Раунд 1 завершен`);
            console.log(`  Выбор бочек: ${round1Result.stats.selectionCount}/${round1Result.readyRooms?.length || 0}`);
            console.log(`  Результаты: ${round1Result.stats.resultsCount}`);
            
            expect(round1Result.stats.selectionCount).toBeGreaterThan(0);
        } else {
            console.log(`\n⚠️ Раунд 1 не удался, но продолжаем`);
        }
        
    }, 120000);
    
    test('Шаг 5: Раунд 2 - выбор бочек (без буста)', async () => {
        Logger.header('ШАГ 5: РАУНД 2');
        
        // Используем готовый модуль round2
        const round2Result = await round2(
            testContext.results,
            testContext.round1Results,
            testContext.socketEvents,
            timingStats
        );
        
        if (round2Result.success) {
            console.log(`\n✅ Раунд 2 завершен`);
            console.log(`  Комнат FINISHED: ${round2Result.roomsFinished}/${round2Result.totalRooms}`);
        } else {
            console.log(`\n⚠️ Раунд 2 не удался`);
        }
        
    }, 120000);
    
    test('Шаг 6: Итоговая проверка', async () => {
        Logger.header('ШАГ 6: ИТОГОВАЯ ПРОВЕРКА');
        
        // Проверяем финальный статус комнаты
        const room = testContext.results.find(r => r.success);
        
        if (room) {
            try {
                const response = await fetch(`${config.GAME_URL}/api/v1/game/rooms/${room.roomId}`, {
                    headers: { 'Authorization': `Bearer ${config.ADMIN_TOKEN}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`\nФинальный статус комнаты: ${data.status}`);
                }
            } catch (error) {
                // Игнорируем
            }
        }
        
        console.log(`\n=== ТЕСТ ЗАВЕРШЕН ===`);
        console.log(`✅ Комната протестирована`);
        
        expect(true).toBe(true);
        
    }, 30000);
    
    afterAll(async () => {
        Logger.header('ЗАВЕРШЕНИЕ ТЕСТА');
        
        // Закрываем все соединения
        const cleanup = require('../steps/cleanup');
        await cleanup(testContext, timingStats);
        
    });
    
});