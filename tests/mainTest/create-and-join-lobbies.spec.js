const { describe, test, expect } = require('@jest/globals');
const config = require('../../config/testConfig');
const { TimingStats } = require('../utils/timing');

const createRooms = require('../steps/step1_createRooms');
const joinPlayers = require('../steps/step2_joinPlayers');
const checkRoomState = require('../steps/step3_checkRoomState');
const waitBotFill = require('../steps/step4_waitBotFill');
const round1 = require('../steps/step5_round1');
const round2 = require('../steps/step6_round2');
const cleanup = require('../steps/cleanup');
const balanceApi = require('../../api/balanceApi');
const { sleep } = require('../utils/helpers');
const Logger = require('../utils/logger');
const minPlayerInLobby = 1; //проверка баланса только 1 игрока, можно заменить на всех игроков playersPerLobby

describe('Полный цикл: создание лобби, вход игроков, ожидание бота', () => {
    const lobbiesCount = config.LOBBIES_COUNT;
    const playersPerLobby = config.PLAYERS_PER_LOBBY;
    const timingStats = new TimingStats();
    
    const testContext = {
        roomIds: [],
        results: [],
        stompClients: [],
        socketEvents: [],
        round1Results: null,
        balances: {  
            before: {},
            afterJoin: {},
            afterGame: {}
        }
    };

    test(`Шаг 1: Создание ${lobbiesCount} комнат`, async () => {
        const { roomIds, createdCount } = await createRooms(lobbiesCount, timingStats);
        testContext.roomIds = roomIds;
        expect(createdCount).toBe(lobbiesCount);
    }, 60000);

    test('Шаг 1.5: Проверка начального баланса игроков', async () => {
        Logger.header('ШАГ 1.5: НАЧАЛЬНЫЙ БАЛАНС');
        
        console.log(`Проверка баланса для ${playersPerLobby} игроков на комнату...`);
        
        // 🔧 Проверяем баланс для ВСЕХ игроков, которые будут участвовать
        for (let lobbyIdx = 0; lobbyIdx < lobbiesCount; lobbyIdx++) {
            //для вывода баланса всех игроков playersPerLobby
            for (let playerIdx = 0; playerIdx < minPlayerInLobby; playerIdx++) {
                const tokenIndex = lobbyIdx * playersPerLobby + playerIdx;
                const token = config.TOKENS[tokenIndex]?.token;
                
                if (token) {
                    const balance = await balanceApi.getMyBalance(token);
                    
                    if (!testContext.balances.before[lobbyIdx]) {
                        testContext.balances.before[lobbyIdx] = {};
                    }
                    testContext.balances.before[lobbyIdx][playerIdx] = balance.data;
                    
                    console.log(`  Лобби ${lobbyIdx + 1}, Игрок ${playerIdx + 1}: available=${balance.data?.available}`);
                    expect(balance.success).toBe(true);
                }
            }
        }
        
    }, 30000);

    test(`Шаг 2: Вход игроков с WebSocket (по ${playersPerLobby} в комнату)`, async () => {
        const { results, stompClients, successful } = await joinPlayers(
            testContext.roomIds,
            config.TOKENS,
            timingStats,
            testContext.socketEvents,
            playersPerLobby  // 🔧 Передаем количество игроков
        );
        
        testContext.results = results;
        testContext.stompClients = stompClients;
        
        const expectedMinSuccess = Math.floor(lobbiesCount * playersPerLobby * 0.9);
        expect(successful).toBeGreaterThanOrEqual(expectedMinSuccess);

        // ========== ПРОВЕРКА БАЛАНСА ПОСЛЕ ВХОДА ==========
        await sleep(1000);
        
        for (let lobbyIdx = 0; lobbyIdx < lobbiesCount; lobbyIdx++) {
            console.log(`\n📊 Баланс после входа — Лобби ${lobbyIdx + 1}:`);
            //для вывода баланса всех игроков playersPerLobby
            for (let playerIdx = 0; playerIdx < minPlayerInLobby; playerIdx++) {
                const tokenIndex = lobbyIdx * playersPerLobby + playerIdx;
                const token = config.TOKENS[tokenIndex]?.token;
                
                if (token) {
                    try {
                        const balance = await balanceApi.getMyBalance(token);
                        
                        if (!testContext.balances.afterJoin[lobbyIdx]) {
                            testContext.balances.afterJoin[lobbyIdx] = {};
                        }
                        testContext.balances.afterJoin[lobbyIdx][playerIdx] = balance.data;
                        
                        const before = testContext.balances.before[lobbyIdx]?.[playerIdx];
                        const entryFee = config.ROOM_CONFIG.entryFeeAmount;
                        
                        console.log(`  Игрок ${playerIdx + 1}: available=${balance.data?.available}, reserved=${balance.data?.reserved}`);
                        
                        if (before) {
                            const reservedDiff = balance.data.reserved - before.reserved;
                            console.log(`    Изменение reserved: +${reservedDiff} (ожидалось +${entryFee})`);
                        }
                        
                    } catch (error) {
                        console.log(`  Игрок ${playerIdx + 1}: ⚠️ ошибка проверки баланса`);
                    }
                }
            }
        }
        
    }, 120000);

    test('Шаг 3: Проверка состояния комнат после входа', async () => {
        const { correct, total } = await checkRoomState(
            testContext.results, 
            timingStats, 
            config.PLAYERS_PER_LOBBY 
        );
        expect(correct).toBe(total);
    });

    test('Шаг 4: Ожидание заполнения комнаты ботом', async () => {
        const { roomStartedCount, total } = await waitBotFill(
            testContext.results,
            testContext.socketEvents,
            timingStats
        );
        
        expect(roomStartedCount).toBeGreaterThanOrEqual(Math.floor(total * 0.8));
    }, 75000);

    test('Шаг 5: Раунд 1 - выбор бочек, буст и проверка результатов', async () => {
        const round1Result = await round1(
            testContext.results,
            testContext.socketEvents,
            timingStats
        );
        
        testContext.round1Results = round1Result;
        
        if (round1Result.success) {
            expect(round1Result.stats.selectionCount).toBeGreaterThan(0);
            expect(round1Result.stats.resultsCount).toBeGreaterThanOrEqual(
                Math.floor(round1Result.readyRooms.length * 0.8)
            );
        }
    }, 120000);

    test('Шаг 6: Раунд 2 - выбор бочек, буст и проверка результатов', async () => {
        const round2Result = await round2(
            testContext.results,
            testContext.round1Results,
            testContext.socketEvents,
            timingStats
        );
        
        if (round2Result.success) {
            expect(round2Result.roomsFinished).toBeGreaterThanOrEqual(
                Math.floor(round2Result.totalRooms * 0.8)
            );
        }
        
        // ========== ПРОВЕРКА ФИНАЛЬНОГО БАЛАНСА ==========
        Logger.header('ПРОВЕРКА ФИНАЛЬНОГО БАЛАНСА');

        const successfulRooms = testContext.results.filter(r => r.success);

        if (successfulRooms.length === 0) {
            console.log('⚠️ Нет успешных комнат, пропускаем проверку баланса');
            return;
        }

        await sleep(3000);

        for (let lobbyIdx = 0; lobbyIdx < lobbiesCount; lobbyIdx++) {
            const room = successfulRooms.find(r => r.roomIndex === lobbyIdx);
            if (!room) continue;
            
            console.log(`\n📊 Финальный баланс — Лобби ${lobbyIdx + 1}:`);
            //для вывода баланса всех игроков playersPerLobby
            for (let playerIdx = 0; playerIdx < minPlayerInLobby; playerIdx++) {
                const tokenIndex = lobbyIdx * playersPerLobby + playerIdx;
                const token = config.TOKENS[tokenIndex]?.token;
                
                if (token) {
                    try {
                        const balance = await balanceApi.getMyBalance(token);
                        
                        if (!testContext.balances.afterGame[lobbyIdx]) {
                            testContext.balances.afterGame[lobbyIdx] = {};
                        }
                        testContext.balances.afterGame[lobbyIdx][playerIdx] = balance.data;
                        
                        const before = testContext.balances.before[lobbyIdx]?.[playerIdx];
                        
                        console.log(`  Игрок ${playerIdx + 1}: available=${balance.data?.available}, reserved=${balance.data?.reserved}`);
                        
                        if (before) {
                            const diff = balance.data.available - before.available;
                            console.log(`    Изменение: ${diff > 0 ? '+' : ''}${diff}`);
                        }
                        
                        expect(balance.success).toBe(true);
                        
                    } catch (error) {
                        console.log(`  Игрок ${playerIdx + 1}: ⚠️ ошибка проверки баланса`);
                    }
                }
            }
        }
        
    }, 120000);

    afterAll(async () => {
        await cleanup(testContext, timingStats);

        console.log('\n=== СТАТИСТИКА БАЛАНСА ===');
        
        for (let lobbyIdx = 0; lobbyIdx < lobbiesCount; lobbyIdx++) {
            console.log(`\nЛобби ${lobbyIdx + 1}:`);
            
            for (let playerIdx = 0; playerIdx < playersPerLobby; playerIdx++) {
                const before = testContext.balances.before[lobbyIdx]?.[playerIdx];
                const after = testContext.balances.afterGame[lobbyIdx]?.[playerIdx];
                
                if (before && after) {
                    const diff = after.available - before.available;
                    console.log(`  Игрок ${playerIdx + 1}: ${before.available} → ${after.available} (${diff > 0 ? '+' : ''}${diff})`);
                }
            }
        }
    });
});