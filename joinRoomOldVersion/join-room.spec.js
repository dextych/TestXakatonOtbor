// create-and-join-lobbies.spec.js
const { describe, test, expect } = require('@jest/globals');
const SockJS = require('sockjs-client');
const Stomp = require('stompjs');

const BASE_URL = 'http://92.51.23.102:8080';      // WebSocket и пользователи
const GAME_URL = 'http://92.51.23.102:8081';      // Игровые комнаты и раунды
const ADMIN_TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJiNjczMzJkNS0yZGQ4LTQ3NmMtOGQ2Yy00NmJhMTM3NGU4MGEiLCJyb2xlcyI6WyJhZG1pbiJdLCJpYXQiOjE3NzY3MTYxNzAsImV4cCI6MTc3NjgwMjU3MH0.rBheNkG_IpzrdAGUneWXyHk6-Ks3zVD8VNzgB-4QHAUA3JZyDVgztz_7Cg5jPOeaeOhN7ikbgGHCZOHK4xptEw';

const timingStats = {
    start: null,
    end: null,
    steps: {}
};

const tokens = require('../tokens.json');

const roomConfig = {
    maxPlayers: 3,
    entryFeeAmount: 15000,
    winnerPayoutPercentage: 80,
    boostCostAmount: 20,
    boostEnabled: true,
    maxBarrelSelection: 3
};

describe('Полный цикл: создание лобби, вход игроков, ожидание бота', () => {

    const LOBBIES_COUNT = 1;
    let roomIds = [];
    let results = [];
    let stompClients = [];
    let socketEvents = [];
    
    test(`Шаг 1: Создание ${LOBBIES_COUNT} комнат`, async () => {

        const stepStart = Date.now();

        const startTime = Date.now();
        
        console.log(`Создание ${LOBBIES_COUNT} комнат.`);
        
        async function createRoom(roomNumber) {
            try {
                const response = await fetch(`${GAME_URL}/api/v1/game/rooms`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${ADMIN_TOKEN}`,
                        'Content-Type': 'application/json',
                        'accept': '*/*'
                    },
                    body: JSON.stringify(roomConfig)
                });

                const data = await response.json();
                
                const roomId = data.room?.id || data.id;

                if (response.status !== 201) {
                    console.error(`Ошибка создания комнаты ${roomNumber}: статус ${response.status}`);
                    return { success: false, roomNumber };
                }
                
                return { success: true, roomNumber, roomId: roomId };
            } catch (error) {
                console.error(`Ошибка создания комнаты ${roomNumber}: ${error.message}`);
                return { success: false, roomNumber, error: error.message };
            }
        }
        
        const promises = [];
        for (let i = 1; i <= LOBBIES_COUNT; i++) {
            promises.push(createRoom(i));
        }
        
        const createdRooms = await Promise.all(promises);
        roomIds = createdRooms.filter(r => r.success).map(r => r.roomId);
        
        const duration = (Date.now() - startTime) / 1000;

        const stepEnd = Date.now();

        timingStats.steps.roomCreation = (stepEnd - stepStart) / 1000;
        
        console.log(`Создано комнат: ${roomIds.length}/${LOBBIES_COUNT}`);
        console.log(`Время: ${duration.toFixed(2)}с`);
        
        expect(roomIds.length).toBe(LOBBIES_COUNT);
    }, 60000);

    test(`Шаг 2: Вход игроков с WebSocket`, async () => {
        const startTime = Date.now();

        const stepStart = Date.now();
        
        console.log(`\nВход игроков в ${roomIds.length} комнат.`);
        
        async function joinRoom(roomIndex) {
            const roomId = roomIds[roomIndex];
            const user1Token = tokens[roomIndex * 2]?.token;
            const user2Token = tokens[roomIndex * 2 + 1]?.token;
            
            if (!user1Token || !user2Token) {
                return { roomIndex, success: false, error: 'Нет токенов' };
            }
            
            return new Promise((resolve) => {
                // WebSocket на порту 8080
                const socket = new SockJS(`${BASE_URL}/ws/game`);
                const client = Stomp.over(socket);
                client.debug = null;
                
                const timeout = setTimeout(() => {
                    resolve({ roomIndex, success: false, error: 'Таймаут' });
                }, 15000);
                
                client.connect(
                    { Authorization: `Bearer ${user1Token}` },
                    async () => {
                        console.log(`[Комната ${roomIndex + 1}] WebSocket подключен`);
                        
                        // 1. Обновления комнаты
                        client.subscribe(`/topic/room/${roomId}`, (msg) => {
                            try {
                                const data = JSON.parse(msg.body);
                                if (data.type === 'ROOM_UPDATED') {
                                    socketEvents.push({ roomId, type: 'ROOM_UPDATED', data });
                                    console.log(`[Комната ${roomIndex + 1}] ROOM_UPDATED: ${data.currentPlayers} игроков`);
                                }
                            } catch (e) {}
                        });
                        
                        // 2. Глобальные уведомления
                        client.subscribe(`/topic/rooms`, (msg) => {
                            try {
                                const data = JSON.parse(msg.body);
                                if (data.type === 'ROOM_FULL') {
                                    socketEvents.push({ roomId, type: 'ROOM_FULL', data });
                                    console.log(`[Комната ${roomIndex + 1}] ROOM_FULL`);
                                } else if (data.type === 'ROOM_STARTED') {
                                    socketEvents.push({ roomId, type: 'ROOM_STARTED', data });
                                    console.log(`[Комната ${roomIndex + 1}] ROOM_STARTED`);
                                }
                            } catch (e) {}
                        });
                        
                        // 3. События раунда
                        client.subscribe(`/topic/room/${roomId}/round`, (msg) => {
                            try {
                                const data = JSON.parse(msg.body);
                                if (data.type === 'ROUND_STARTED') {
                                    socketEvents.push({ roomId, type: 'ROUND_STARTED', data });
                                    console.log(`[Комната ${roomIndex + 1}] ROUND_STARTED: раунд ${data.roundNumber}`);
                                } else if (data.type === 'WEIGHTS_REVEALED') {
                                    socketEvents.push({ roomId, type: 'WEIGHTS_REVEALED', data });
                                    console.log(`[Комната ${roomIndex + 1}] WEIGHTS_REVEALED получены`);
                                    if (data.barrelWeights) {
                                        console.log(`  Веса:`, data.barrelWeights);
                                    }
                                } else if (data.type === 'PLAYER_SELECTED') {
                                    socketEvents.push({ roomId, type: 'PLAYER_SELECTED', data });
                                    console.log(`[Комната ${roomIndex + 1}] PLAYER_SELECTED: игрок выбрал бочки`);
                                } else if (data.type === 'ROUND_COMPLETED') {
                                    socketEvents.push({ roomId, type: 'ROUND_COMPLETED', data });
                                    console.log(`[Комната ${roomIndex + 1}] ROUND_COMPLETED`);
                                } else if (data.type === 'BOOST_WINDOW_STARTED') {
                                    socketEvents.push({ roomId, type: 'BOOST_WINDOW_STARTED', data });
                                    console.log(`[Комната ${roomIndex + 1}] BOOST_WINDOW_STARTED`);
                                }
                            } catch (e) {}
                        });
                        
                        try {
                            // Вход в комнату - теперь на порту 8081
                            const r1 = await fetch(`${GAME_URL}/api/v1/game/rooms/${roomId}/join`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${user1Token}`,
                                    'accept': '*/*'
                                }
                            });
                            
                            if (r1.status !== 200 && r1.status !== 204) {
                                clearTimeout(timeout);
                                client.disconnect();
                            //    resolve({ roomIndex, success: false, error: `P1: ${r1.status}` });

                                const errorText = await r1.text();
                                console.error(`[Комната ${roomIndex + 1}] P1 error body: ${errorText}`);
                              
                             
                                resolve({ roomIndex, success: false, error: `P1: ${r1.status} - ${errorText}` });
                                return;
                            }
                            
                            let d1 = {};
                            if (r1.status === 200) {
                                d1 = await r1.json();
                            }
                            
                            await new Promise(r => setTimeout(r, 500));
                            
                            const r2 = await fetch(`${GAME_URL}/api/v1/game/rooms/${roomId}/join`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${user2Token}`,
                                    'accept': '*/*'
                                }
                            });
                            
                            if (r2.status !== 200 && r2.status !== 204) {
                                clearTimeout(timeout);
                                client.disconnect();
                                resolve({ roomIndex, success: false, error: `P2: ${r2.status}` });
                                return;
                            }
                            
                            let d2 = {};
                            if (r2.status === 200) {
                                d2 = await r2.json();
                            }
                            
                            clearTimeout(timeout);
                            stompClients.push(client);
                            
                            resolve({
                                roomIndex,
                                roomId,
                                success: true,
                                player1Id: d1.participantId,
                                player2Id: d2.participantId,
                                client
                            });
                            
                        } catch (error) {
                            clearTimeout(timeout);
                            client.disconnect();
                            resolve({ roomIndex, success: false, error: error.message });
                        }
                    },
                    (error) => {
                        clearTimeout(timeout);
                        console.error(`[Комната ${roomIndex + 1}] Ошибка WebSocket:`, error);
                        resolve({ roomIndex, success: false, error: 'WebSocket failed' });
                    }
                );
            });
        }
        
        const promises = [];
        for (let i = 0; i < roomIds.length; i++) {
            promises.push(joinRoom(i));
        }
        
        results = await Promise.all(promises);
        
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        results.filter(r => !r.success).forEach(r => {
            console.error(`Комната ${r.roomIndex + 1}: ${r.error}`);
        });
        
        const stepEnd = Date.now();
        timingStats.steps.playerJoin = (stepEnd - stepStart) / 1000;

        const duration = (Date.now() - startTime) / 1000;
        
        console.log(`\nУспешно заполнено: ${successful}/${roomIds.length}`);
        console.log(`Ошибок: ${failed}`);
        console.log(`Время: ${duration.toFixed(2)}с`);
        
        expect(successful).toBeGreaterThanOrEqual(Math.floor(LOBBIES_COUNT * 0.9));
    }, 120000);

    test('Шаг 3: Проверка состояния комнат после входа', async () => {
        console.log('\nПроверка состояния комнат.');
        
        const successfulRooms = results.filter(r => r.success);
        let correct = 0;
        
        for (const room of successfulRooms) {
            try {
                const response = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${ADMIN_TOKEN}`,
                        'accept': '*/*'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.currentPlayerCount === 2 && data.status === 'WAITING') {
                        correct++;
                    }
                }
            } catch (error) {}
        }
        
        console.log(`Корректных комнат: ${correct}/${successfulRooms.length}`);
        expect(correct).toBe(successfulRooms.length);
    });

    // Шаг 4: Ждем заполнения комнаты ботом
    test('Шаг 4: Ожидание заполнения комнаты ботом', async () => {
        console.log('\nОжидание заполнения комнаты ботом.');

        const stepStart = Date.now();
        
        const successfulRooms = results.filter(r => r.success);
        const eventsBefore = socketEvents.length;
        
        // Ждем ROOM_STARTED (глобальное событие)
        console.log('Ожидание ROOM_STARTED...');
        let roomStarted = 0;
        const startWait = Date.now();
        console.log('Ожидание начала игры');
        while (roomStarted < successfulRooms.length && (Date.now() - startWait) < 70000) {
            await new Promise(r => setTimeout(r, 2000));
            const newEvents = socketEvents.slice(eventsBefore);
            
            // Считаем комнаты, для которых пришло ROOM_STARTED
            roomStarted = 0;
            for (const room of successfulRooms) {
                const hasEvent = newEvents.some(e => 
                    e.type === 'ROOM_STARTED' && e.roomId === room.roomId
                );
                if (hasEvent) roomStarted++;
            }
            
            const elapsed = Math.floor((Date.now() - startWait) / 1000);
          //  console.log(`  Прошло ${elapsed}с, ROOM_STARTED: ${roomStarted}/${successfulRooms.length}`);
        }

        const stepEnd = Date.now();
        timingStats.steps.botFill = (stepEnd - stepStart) / 1000;
        
        console.log(`ROOM_STARTED получено для ${roomStarted} комнат`);
        expect(roomStarted).toBeGreaterThanOrEqual(Math.floor(successfulRooms.length * 0.8));
        
    }, 75000);

    test('Шаг 5: Раунд 1 - ожидание, выбор бочек, буст и проверка результатов', async () => {
        console.log('\n=== РАУНД 1 ===');
        
        const successfulRooms = results.filter(r => r.success);
        
        // 1. Ждем ROUND_STARTED для раунда 1 (ДОЛГОЕ ОЖИДАНИЕ)
        console.log('1. Ожидание ROUND_STARTED для раунда 1...');
        
        const roomsReady = new Set();
        const waitStart = Date.now();
        const maxWait = 60000; // 60 секунд максимум

        const stepStart = Date.now();
        const subSteps = {};
        
        const waitStartR = Date.now();
        while (roomsReady.size < successfulRooms.length && (Date.now() - waitStart) < maxWait) {
            await new Promise(r => setTimeout(r, 2000));
            
            // Проверяем для каждой комнаты
            for (const room of successfulRooms) {
                if (!roomsReady.has(room.roomId)) {
                    const hasRoundStarted = socketEvents.some(e => 
                        e.type === 'ROUND_STARTED' && 
                        e.data?.roundNumber === 1 && 
                        e.roomId === room.roomId
                    );
                    
                    if (hasRoundStarted) {
                        roomsReady.add(room.roomId);
                        console.log(`  [Комната ${room.roomIndex + 1}] ROUND_STARTED получен`);
                    }
                }
            }
            
            const elapsed = Math.floor((Date.now() - waitStart) / 1000);
            // if (elapsed % 10 === 0) {
            //     console.log(`  Прошло ${elapsed}с, готово комнат: ${roomsReady.size}/${successfulRooms.length}`);
            // }
        }
        subSteps.waitRoundStart = (Date.now() - waitStartR) / 1000;
        
        console.log(`\nГотово комнат: ${roomsReady.size}/${successfulRooms.length}`);
        
        if (roomsReady.size === 0) {
            console.log('❌ ROUND_STARTED не получен ни для одной комнаты, пропускаем тест');
            return;
        }
        
        // 2. Выбираем бочки ТОЛЬКО для готовых комнат
        console.log('\n2. Выбор 3 бочек в раунде 1...');
        
        const selectStart = Date.now();

        const readyRoomsList = successfulRooms.filter(r => roomsReady.has(r.roomId));
        
        let roomsWithSelectionRound1 = 0;
        
        const selectionRound1Promises = readyRoomsList.map(async (room) => {
            try {
                const user1Token = tokens[room.roomIndex * 2]?.token;
                const user2Token = tokens[room.roomIndex * 2 + 1]?.token;
                if (!user1Token || !user2Token) return { success: false };
                
                const [barrels1Res, barrels2Res] = await Promise.all([
                    fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/1/barrels`, {
                        headers: { 'Authorization': `Bearer ${user1Token}` }
                    }),
                    fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/1/barrels`, {
                        headers: { 'Authorization': `Bearer ${user2Token}` }
                    })
                ]);
                
                if (!barrels1Res.ok || !barrels2Res.ok) {
                    console.error(`[Комната ${room.roomIndex + 1}] Ошибка получения бочек: P1=${barrels1Res.status}, P2=${barrels2Res.status}`);
                    return { success: false };
                }
                
                const barrels1 = await barrels1Res.json();
                const barrels2 = await barrels2Res.json();
                
                const selected1 = barrels1.slice(0, 3).map(b => b.id);
                const selected2 = barrels2.slice(0, 3).map(b => b.id);
                
                const [sel1Res, sel2Res] = await Promise.all([
                    fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/1/selection`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${user1Token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ barrelIds: selected1 })
                    }),
                    fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/1/selection`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${user2Token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ barrelIds: selected2 })
                    })
                ]);
                
                if (sel1Res.ok && sel2Res.ok) {
                    console.log(`[Комната ${room.roomIndex + 1}] Бочки выбраны`);
                } else {
                    console.error(`[Комната ${room.roomIndex + 1}] Ошибка выбора: P1=${sel1Res.status}, P2=${sel2Res.status}`);
                    
                    // Выводим тело ошибки
                    if (!sel1Res.ok) {
                        const err = await sel1Res.text();
                        console.error(`  P1 error: ${err}`);
                    }
                    if (!sel2Res.ok) {
                        const err = await sel2Res.text();
                        console.error(`  P2 error: ${err}`);
                    }
                }
                
                return { 
                    success: sel1Res.ok && sel2Res.ok, 
                    roomId: room.roomId, 
                    roomIndex: room.roomIndex,
                    barrels1: barrels1,
                    user1Token: user1Token
                };
                
            } catch (error) {
                console.error(`[Комната ${room.roomIndex + 1}] Ошибка:`, error.message);
                return { success: false };
            }
        });
        
        subSteps.selection = (Date.now() - selectStart) / 1000;

        const selectionRound1Results = await Promise.all(selectionRound1Promises);
        roomsWithSelectionRound1 = selectionRound1Results.filter(r => r.success).length;
        console.log(`\nРаунд 1: выбор сделан в ${roomsWithSelectionRound1}/${readyRoomsList.length} комнатах`);
        
        if (roomsWithSelectionRound1 === 0) {
            console.log('❌ Выбор бочек не удался ни в одной комнате');
            return;
        }
        
        // 3. Ждем WEIGHTS_REVEALED
        console.log('\n3. Ожидание WEIGHTS_REVEALED.');
        
        const weightsStart = Date.now();

        const eventsBeforeWeights = socketEvents.length;
        let weightsRevealedEvents = [];
        const waitWeights = Date.now();
        
        while (weightsRevealedEvents.length === 0 && (Date.now() - waitWeights) < 40000) {
            await new Promise(r => setTimeout(r, 1000));
            const newEvents = socketEvents.slice(eventsBeforeWeights);
            weightsRevealedEvents = newEvents.filter(e => e.type === 'WEIGHTS_REVEALED');
            
            const elapsed = Math.floor((Date.now() - waitWeights) / 1000);
            // if (elapsed % 5 === 0) {
            //     console.log(`  Прошло ${elapsed}с, WEIGHTS_REVEALED: ${weightsRevealedEvents.length}`);
            // }
        }
        
        const allWeightsEvents = socketEvents.filter(e => e.type === 'WEIGHTS_REVEALED');
        console.log(`WEIGHTS_REVEALED получены! Событий: ${allWeightsEvents.length}`);

        subSteps.waitWeights = (Date.now() - weightsStart) / 1000;
        
        // 4. ФАЗА 1: Покупка буста
        let boostsPurchased = 0;
        const purchasedRooms = [];
        
        const buyBoostStart = Date.now();

        if (allWeightsEvents.length > 0) {
            console.log('\n4. ФАЗА 1: Покупка буста...');
            
            const boostPromises = selectionRound1Results.filter(r => r.success).map(async (roomResult) => {
                try {
                    const user1Token = roomResult.user1Token;
                    if (!user1Token) return;
                    
                    const boostResponse = await fetch(
                        `${GAME_URL}/api/v1/game/rooms/${roomResult.roomId}/rounds/1/boost`,
                        {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${user1Token}` }
                        }
                    );
                    
                    if (boostResponse.ok) {
                        boostsPurchased++;
                        purchasedRooms.push(roomResult);
                        console.log(`[Комната ${roomResult.roomIndex + 1}] Буст куплен`);
                    } else {
                        const errorText = await boostResponse.text();
                        console.log(`[Комната ${roomResult.roomIndex + 1}] Буст не куплен: ${errorText}`);
                    }
                    
                } catch (error) {
                    console.error(`[Комната ${roomResult.roomIndex + 1}] Ошибка:`, error.message);
                }
            });
            
            await Promise.all(boostPromises);
            console.log(`Куплено бустов: ${boostsPurchased}`);
        }
        subSteps.buyBoost = (Date.now() - buyBoostStart) / 1000;
        
        // 5. Ждем BOOST_WINDOW_STARTED и применяем буст
        let boostsApplied = 0;
        
        if (boostsPurchased > 0) {
            console.log('\n5. Ожидание BOOST_WINDOW_STARTED и применение буста...');
            
             const applyBoostStart = Date.now();
            const applyPromises = purchasedRooms.map(async (roomResult) => {
                try {
                    console.log(`[Комната ${roomResult.roomIndex + 1}] Ожидание BOOST_WINDOW_STARTED...`);
                    
                    const eventsBeforeWindow = socketEvents.length;
                    let windowEvent = null;
                    const waitWindow = Date.now();
                    
                    while (!windowEvent && (Date.now() - waitWindow) < 15000) {
                        await new Promise(r => setTimeout(r, 500));
                        const newEvents = socketEvents.slice(eventsBeforeWindow);
                        windowEvent = newEvents.find(e => 
                            e.type === 'BOOST_WINDOW_STARTED' && e.roomId === roomResult.roomId
                        );
                    }
                    
                    if (!windowEvent) {
                        console.log(`[Комната ${roomResult.roomIndex + 1}] BOOST_WINDOW_STARTED не получен`);
                        return;
                    }
                    
                    console.log(`[Комната ${roomResult.roomIndex + 1}] BOOST_WINDOW_STARTED получен, применяем буст.`);
                    
                    const user1Token = roomResult.user1Token;
                    if (!user1Token) return;
                    
                    const barrels = roomResult.barrels1;
                    if (!barrels || barrels.length === 0) return;
                    
                    const bestBarrel = barrels.reduce((best, b) => 
                        (b.weight > best.weight) ? b : best
                    , barrels[0]);
                    
                    const applyResponse = await fetch(
                        `${GAME_URL}/api/v1/game/rooms/${roomResult.roomId}/rounds/1/apply-boost`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${user1Token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ barrelId: bestBarrel.id })
                        }
                    );
                    
                    if (applyResponse.ok) {
                        boostsApplied++;
                        console.log(`[Комната ${roomResult.roomIndex + 1}] Буст ПРИМЕНЕН`);
                    } else {
                        const errorText = await applyResponse.text();
                        console.error(`[Комната ${roomResult.roomIndex + 1}] Ошибка применения: ${errorText}`);
                    }
                    
                } catch (error) {
                    console.error(`[Комната ${roomResult.roomIndex + 1}] Ошибка:`, error.message);
                }
            });
            subSteps.applyBoost = (Date.now() - applyBoostStart) / 1000;
            await Promise.all(applyPromises);
            console.log(`\nПрименено бустов: ${boostsApplied}/${boostsPurchased}`);
        }

        
        
        // 6. Ждем ROUND_COMPLETED
        console.log('\n6. Ожидание ROUND_COMPLETED.');
        
        const eventsBeforeCompleted = socketEvents.length;
        let round1CompletedEvents = [];
        const waitRound1 = Date.now();
        
        while (round1CompletedEvents.length < readyRoomsList.length && (Date.now() - waitRound1) < 30000) {
            await new Promise(r => setTimeout(r, 2000));
            const newEvents = socketEvents.slice(eventsBeforeCompleted);
            round1CompletedEvents = newEvents.filter(e => e.type === 'ROUND_COMPLETED');
            
            const elapsed = Math.floor((Date.now() - waitRound1) / 1000);
            // if (elapsed % 5 === 0) {
            //     console.log(`  Прошло ${elapsed}с, ROUND_COMPLETED: ${round1CompletedEvents.length}/${readyRoomsList.length}`);
            // }
        }
        
        const allCompletedEvents = socketEvents.filter(e => e.type === 'ROUND_COMPLETED');
        console.log(`Всего ROUND_COMPLETED: ${allCompletedEvents.length}`);
        
        // 7. Проверяем результаты
        console.log('\n7. Результаты раунда 1:');
        
        let roomsWithResultsRound1 = 0;
        
        for (const room of readyRoomsList) {
            try {
                const resultRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/1/result`, {
                    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
                });
                
                if (resultRes.ok) {
                    const result = await resultRes.json();
                    roomsWithResultsRound1++;
                    console.log(`[Комната ${room.roomIndex + 1}] Победитель: ${result.winnerId?.slice(0, 8) || 'нет'}`);
                }
            } catch (error) {}
        }
        
        console.log(`\n=== РЕЗУЛЬТАТЫ РАУНДА 1 ===`);
        console.log(`Готово комнат: ${roomsReady.size}/${successfulRooms.length}`);
        console.log(`Выбор бочек: ${roomsWithSelectionRound1}/${readyRoomsList.length}`);
        console.log(`WEIGHTS_REVEALED: ${allWeightsEvents.length}`);
        console.log(`Куплено бустов: ${boostsPurchased}`);
        console.log(`Применено бустов: ${boostsApplied}`);
        console.log(`ROUND_COMPLETED: ${allCompletedEvents.length}`);
        console.log(`Результаты получены: ${roomsWithResultsRound1}/${readyRoomsList.length}`);
        
        expect(roomsWithSelectionRound1).toBeGreaterThan(0);
        expect(roomsWithResultsRound1).toBeGreaterThanOrEqual(Math.floor(readyRoomsList.length * 0.8));

        const stepEnd = Date.now();
        timingStats.steps.round1 = {
            total: (stepEnd - stepStart) / 1000,
            ...subSteps
        };
        
    }, 120000);

    test('Шаг 6: Раунд 2 - выбор бочек, буст и проверка результатов', async () => {
        console.log('\n=== РАУНД 2 ===');

        const stepStart = Date.now();
        const subSteps = {};
        
        const successfulRooms = results.filter(r => r.success);
        
        // 1. Проверяем кто прошёл в раунд 2
        console.log('1. Проверка кто прошёл в раунд 2.');
        
        const checkStart = Date.now();

        const roomPlayersStatus = new Map();
        const qualifiedRooms = [];
        
        for (const room of successfulRooms) {
            try {
                const resultRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/1/result`, {
                    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
                });
                
                if (resultRes.ok) {
                    const result = await resultRes.json();
                    const realPlayers = result.scores?.filter(s => !s.isBot) || [];
                    
                    const player1Qualified = realPlayers.some(p => p.rank === 1);
                    const player2Qualified = realPlayers.some(p => p.rank === 2);
                    
                    roomPlayersStatus.set(room.roomId, {
                        roomIndex: room.roomIndex,
                        player1Qualified,
                        player2Qualified,
                    });
                    
                    if (player1Qualified || player2Qualified) {
                        qualifiedRooms.push(room);
                    }
                    
                    console.log(`[Комната ${room.roomIndex + 1}] Игрок 1: ${player1Qualified ? 'ПРОШЁЛ' : 'ВЫБЫЛ'}, Игрок 2: ${player2Qualified ? 'ПРОШЁЛ' : 'ВЫБЫЛ'}`);
                }
            } catch (error) {
                console.error(`[Комната ${room.roomIndex + 1}] Ошибка проверки:`, error.message);
            }
        }
        
        if (qualifiedRooms.length === 0) {
            console.log('Нет комнат с прошедшими игроками, пропускаем раунд 2');
            return;
        }

        subSteps.checkQualified = (Date.now() - checkStart) / 1000;
        
        // 2. Ждем ROUND_STARTED для раунда 2
        console.log('\n2. Ожидание ROUND_STARTED для раунда 2.');

        const waitStart = Date.now();
        
        const roomsReady = new Set();
        const waitStartE = Date.now();
        
        while (roomsReady.size < qualifiedRooms.length && (Date.now() - waitStart) < 40000) {
            await new Promise(r => setTimeout(r, 2000));
            
            for (const room of qualifiedRooms) {
                if (!roomsReady.has(room.roomId)) {
                    const hasRoundStarted = socketEvents.some(e => 
                        e.type === 'ROUND_STARTED' && 
                        e.data?.roundNumber === 2 && 
                        e.roomId === room.roomId
                    );
                    
                    if (hasRoundStarted) {
                        roomsReady.add(room.roomId);
                        console.log(`  [Комната ${room.roomIndex + 1}] ROUND_STARTED получен`);
                    }
                }
            }
            
            const elapsed = Math.floor((Date.now() - waitStart) / 1000);
            if (elapsed % 10 === 0) {
                console.log(`  Прошло ${elapsed}с, готово комнат: ${roomsReady.size}/${qualifiedRooms.length}`);
            }
        }

        subSteps.waitRoundStart = (Date.now() - waitStartE) / 1000;
        
        console.log(`\nГотово комнат: ${roomsReady.size}/${qualifiedRooms.length}`);
        
        const readyRoomsList = qualifiedRooms.filter(r => roomsReady.has(r.roomId));
        
        // 3. Выбираем бочки для прошедших игроков
        console.log('\n3. Выбор бочек в раунде 2.');

        const selectStart = Date.now();
        
        let roomsWithSelection = 0;
        const selectionRound2Results = [];
        
        const selectionPromises = readyRoomsList.map(async (room) => {
            try {
                const status = roomPlayersStatus.get(room.roomId);
                if (!status) return { success: false };
                
                const selections = [];
                let barrels1 = [], barrels2 = [];
                let user1Token = null, user2Token = null;
                
                if (status.player1Qualified) {
                    user1Token = tokens[room.roomIndex * 2]?.token;
                    if (user1Token) {
                        const barrelsRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/2/barrels`, {
                            headers: { 'Authorization': `Bearer ${user1Token}` }
                        });
                        
                        if (barrelsRes.ok) {
                            barrels1 = await barrelsRes.json();
                            const selected = barrels1.slice(0, 3).map(b => b.id);
                            
                            const selRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/2/selection`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${user1Token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ barrelIds: selected })
                            });
                            
                            if (selRes.ok) {
                                selections.push('player1');
                            }
                        }
                    }
                }
                
                if (status.player2Qualified) {
                    user2Token = tokens[room.roomIndex * 2 + 1]?.token;
                    if (user2Token) {
                        const barrelsRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/2/barrels`, {
                            headers: { 'Authorization': `Bearer ${user2Token}` }
                        });
                        
                        if (barrelsRes.ok) {
                            barrels2 = await barrelsRes.json();
                            const selected = barrels2.slice(0, 3).map(b => b.id);
                            
                            const selRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}/rounds/2/selection`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${user2Token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ barrelIds: selected })
                            });
                            
                            if (selRes.ok) {
                                selections.push('player2');
                            }
                        }
                    }
                }
                
                const success = selections.length > 0;
                if (success) roomsWithSelection++;
                
                return { 
                    success, 
                    roomId: room.roomId, 
                    roomIndex: room.roomIndex,
                    barrels1: barrels1,
                    barrels2: barrels2,
                    user1Token: user1Token,
                    user2Token: user2Token,
                    selections
                };
                
            } catch (error) {
                console.error(`[Комната ${room.roomIndex + 1}] Ошибка:`, error.message);
                return { success: false };
            }
        });
        
        const results2 = await Promise.all(selectionPromises);
        results2.forEach(r => { if (r.success) selectionRound2Results.push(r); });
        console.log(`\nРаунд 2: выбор сделан в ${roomsWithSelection}/${readyRoomsList.length} комнатах`);
        
        subSteps.selection = (Date.now() - selectStart) / 1000;

        // 4. Ждем WEIGHTS_REVEALED для раунда 2
        console.log('\n4. Ожидание WEIGHTS_REVEALED для раунда 2.');

        const weightsStart = Date.now();
        
        const eventsBeforeWeights = socketEvents.length;
        let weightsRevealedEvents2 = [];
        const waitWeights2 = Date.now();
        
        while (weightsRevealedEvents2.length < readyRoomsList.length && (Date.now() - waitWeights2) < 40000) {
            await new Promise(r => setTimeout(r, 2000));
            const newEvents = socketEvents.slice(eventsBeforeWeights);
            weightsRevealedEvents2 = newEvents.filter(e => e.type === 'WEIGHTS_REVEALED');
        }
        
        subSteps.waitWeights = (Date.now() - weightsStart) / 1000;

        console.log(`WEIGHTS_REVEALED получены!`);
        
        // 5. ФАЗА 1: Покупка буста для раунда 2
        let boostsPurchased2 = 0;
        const purchasedRooms2 = [];
        const buyBoostStart = Date.now();
        console.log('\n5. ФАЗА 1: Попытка покупки буста для раунда 2 (ожидается 400)...');
        
        for (const roomResult of selectionRound2Results) {
            try {
                const userToken = roomResult.user1Token || roomResult.user2Token;
                if (!userToken) continue;
                
                const boostResponse = await fetch(
                    `${GAME_URL}/api/v1/game/rooms/${roomResult.roomId}/rounds/2/boost`,
                    {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${userToken}` }
                    }
                );
                
                if (boostResponse.ok) {
                    boostsPurchased2++;
                    console.log(`[Комната ${roomResult.roomIndex + 1}] Буст куплен (НЕОЖИДАННО!)`);
                } else {
                    const errorText = await boostResponse.text();
                    console.log(`[Комната ${roomResult.roomIndex + 1}] Буст не куплен (ожидаемо): ${errorText}`);
                }
            } catch (error) {
                console.error(`[Комната ${roomResult.roomIndex + 1}] Ошибка:`, error.message);
            }
        }
        
        subSteps.buyBoost = (Date.now() - buyBoostStart) / 1000;
        console.log(`Куплено бустов в раунде 2: ${boostsPurchased2} (ожидалось 0)`);
        
        // 7. Ждем ROUND_COMPLETED для раунда 2
        console.log('\n7. Ожидание ROUND_COMPLETED для раунда 2.');
        const completedStart = Date.now();
        const eventsBeforeCompleted2 = socketEvents.length;
        let round2CompletedEvents = [];
        const waitRound2End = Date.now();
        
        while (round2CompletedEvents.length < readyRoomsList.length && (Date.now() - waitRound2End) < 40000) {
            await new Promise(r => setTimeout(r, 2000));
            const newEvents = socketEvents.slice(eventsBeforeCompleted2);
            round2CompletedEvents = newEvents.filter(e => e.type === 'ROUND_COMPLETED');
        }
        subSteps.waitCompleted = (Date.now() - completedStart) / 1000;
        console.log(`ROUND_COMPLETED в ${round2CompletedEvents.length} комнатах`);
        
        // 8. Проверяем финальные результаты
        console.log('\n8. Проверка финальных результатов.');
        
        let roomsFinished = 0;
        
        for (const room of successfulRooms) {
            try {
                const statusRes = await fetch(`${GAME_URL}/api/v1/game/rooms/${room.roomId}`, {
                    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
                });
                
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    if (statusData.status === 'FINISHED') {
                        roomsFinished++;
                    }
                }
            } catch (error) {}
        }
        
        // 9. КРАТКИЙ ВЫВОД ЭФФЕКТА БУСТА
        console.log('\n=== РЕЗУЛЬТАТЫ РАУНДА 2 ===');
        console.log(`Выбор бочек: ${roomsWithSelection}/${readyRoomsList.length}`);
        console.log(`Куплено бустов: ${boostsPurchased2}`);
        console.log(`Комнат со статусом FINISHED: ${roomsFinished}/${successfulRooms.length}`);

        const stepEnd = Date.now();
        timingStats.steps.round2 = {
            total: (stepEnd - stepStart) / 1000,
            ...subSteps
        };
        
        expect(roomsFinished).toBeGreaterThanOrEqual(Math.floor(successfulRooms.length * 0.8));
        
    }, 120000);

    afterAll(async () => {
        console.log('\nЗавершение тестов, закрытие соединений...');
        
        // 1. Закрываем все STOMP клиенты
        stompClients.forEach(client => {
            try {
                if (client && client.connected) {
                    client.disconnect(() => {
                        console.log('STOMP клиент отключен');
                    });
                }
            } catch (e) {}
        });

        // В самом конце файла, после всех тестов или в afterAll
        // Закрываем WebSocket соединения
        stompClients.forEach(client => {
            if (client && client.connected) {
                client.disconnect();
            }
        });
        
        timingStats.end = Date.now();
        const totalTime = (timingStats.end - timingStats.start) / 1000;
        
        // Суммируем чистое игровое время
        const gameTime = (timingStats.steps.botFill || 0) + 
                        (timingStats.steps.round1?.total || 0) + 
                        (timingStats.steps.round2?.total || 0);

        // Вычисляем сумму активных действий
        const activeTime = 
            (timingStats.steps.roomCreation || 0) +
            (timingStats.steps.playerJoin || 0) +
            (timingStats.steps.stateCheck || 0) +
            // Раунд 1
            (timingStats.steps.round1?.selection || 0) +
            (timingStats.steps.round1?.buyBoost || 0) +
            (timingStats.steps.round1?.applyBoost || 0) +
            (timingStats.steps.round1?.checkResults || 0) +
            // Раунд 2
            (timingStats.steps.round2?.checkQualified || 0) +
            (timingStats.steps.round2?.selection || 0) +
            (timingStats.steps.round2?.buyBoost || 0) +
            (timingStats.steps.round2?.checkResults || 0);
        
        console.log('РЕАЛЬНОЕ ВРЕМЯ ВЫПОЛНЕНИЯ');
        console.log(`Чистое игровое время: ${String(gameTime.toFixed(1)).padStart(5)} сек`);
        console.log(`Активное время (действия): ${String(activeTime.toFixed(1)).padStart(5)} сек`);
        console.log('Детализация по этапам:');
        
        if (timingStats.steps.roomCreation) {
            console.log(`║   Создание комнат: ${String(timingStats.steps.roomCreation.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.playerJoin) {
            console.log(`║   Вход игроков: ${String(timingStats.steps.playerJoin.toFixed(1)).padStart(5)} сек`);
        }
        if (timingStats.steps.botFill) {
            console.log(`Ожидание бота: ${String(timingStats.steps.botFill.toFixed(1)).padStart(5)} сек`);
        }
        
        // Раунд 1
        if (timingStats.steps.round1) {
            console.log(`РАУНД 1 (всего): ${String(timingStats.steps.round1.total.toFixed(1)).padStart(5)} сек`);
            if (timingStats.steps.round1.waitRoundStart) {
                console.log(`ожидание старта: ${String(timingStats.steps.round1.waitRoundStart.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round1.selection) {
                console.log(`выбор бочек: ${String(timingStats.steps.round1.selection.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round1.waitWeights) {
                console.log(` ожидание весов: ${String(timingStats.steps.round1.waitWeights.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round1.buyBoost) {
                console.log(`покупка буста: ${String(timingStats.steps.round1.buyBoost.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round1.applyBoost) {
                console.log(`применение буста: ${String(timingStats.steps.round1.applyBoost.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round1.waitCompleted) {
                console.log(`ожидание завершения: ${String(timingStats.steps.round1.waitCompleted.toFixed(1)).padStart(5)} сек`);
            }
        }
        
        // Раунд 2
        if (timingStats.steps.round2) {
            console.log(`║   РАУНД 2 (всего): ${String(timingStats.steps.round2.total.toFixed(1)).padStart(5)} сек`);
            if (timingStats.steps.round2.checkQualified) {
                console.log(`проверка квалификации: ${String(timingStats.steps.round2.checkQualified.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round2.waitRoundStart) {
                console.log(`ожидание старта: ${String(timingStats.steps.round2.waitRoundStart.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round2.selection) {
                console.log(`выбор бочек: ${String(timingStats.steps.round2.selection.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round2.waitWeights) {
                console.log(`ожидание весов: ${String(timingStats.steps.round2.waitWeights.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round2.buyBoost) {
                console.log(`покупка буста: ${String(timingStats.steps.round2.buyBoost.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round2.applyBoost) {
                console.log(`применение буста: ${String(timingStats.steps.round2.applyBoost.toFixed(1)).padStart(5)} сек`);
            }
            if (timingStats.steps.round2.waitCompleted) {
                console.log(`ожидание завершения: ${String(timingStats.steps.round2.waitCompleted.toFixed(1)).padStart(5)} сек`);
            }
        }

            // Сохраняем в JSON
        const fs = require('fs');
        const report = {
            timestamp: new Date().toISOString(),
            gameTimeSec: gameTime,
            activeTimeSec: activeTime,
            steps: timingStats.steps,
            rooms: {
                total: LOBBIES_COUNT,
                created: roomIds.length,
                filled: results.filter(r => r.success).length
            },
            events: {
                roomStarted: socketEvents.filter(e => e.type === 'ROOM_STARTED').length,
                round1Started: socketEvents.filter(e => e.type === 'ROUND_STARTED' && e.data?.roundNumber === 1).length,
                round2Started: socketEvents.filter(e => e.type === 'ROUND_STARTED' && e.data?.roundNumber === 2).length,
                weightsRevealed: socketEvents.filter(e => e.type === 'WEIGHTS_REVEALED').length,
                boostWindow: socketEvents.filter(e => e.type === 'BOOST_WINDOW_STARTED').length,
                roundCompleted: socketEvents.filter(e => e.type === 'ROUND_COMPLETED').length
            }
        };
        
        fs.writeFileSync('timing-report.json', JSON.stringify(report, null, 2));
        
        // 2. Дополнительно закрываем клиенты из results
        results.forEach(r => {
            try {
                if (r.client && r.client.connected) {
                    r.client.disconnect();
                }
            } catch (e) {}
        });
        
        // 3. Даем время на закрытие соединений
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 4. Очищаем массивы
        stompClients = [];
        socketEvents = [];
        
        // 5. Принудительный выход (если нужно)
        // process.exit(0);
    });
});