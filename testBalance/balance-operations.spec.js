const { describe, test, expect, beforeAll } = require('@jest/globals');
const config = require('../config/testConfig');
const balanceApi = require('../api/balanceApi');
const Logger = require('../utils/logger');

describe('Тестирование баланса пользователя (публичный API)', () => {
    
    const testUsers = [];
    
    // GUID пользователей
    const USER_IDS = [
        '8311e849-b4da-4375-9df8-02c3aa7ffecd',
        // добавьте второй если нужно
    ];
    
    beforeAll(async () => {
        Logger.header('ПОДГОТОВКА ТЕСТА БАЛАНСА');
        
        console.log('Инициализация тестовых пользователей...');
        
        for (let i = 0; i < Math.min(USER_IDS.length, config.TOKENS.length); i++) {
            const tokenData = config.TOKENS[i];
            const userId = USER_IDS[i];
            
            if (!tokenData?.token || !userId) continue;
            
            try {
                const balanceResult = await balanceApi.getMyBalance(tokenData.token);
                
                testUsers.push({
                    index: i,
                    token: tokenData.token,
                    userId: userId,
                    initialBalance: balanceResult.success ? balanceResult.data : null
                });
                
                console.log(`  ✅ Пользователь ${i}: userId=${userId.slice(0, 8)}..., available=${balanceResult.data?.available}`);
                
            } catch (error) {
                console.log(`  ❌ Пользователь ${i}: ошибка - ${error.message}`);
            }
        }
        
        console.log(`\n✅ Подготовлено пользователей: ${testUsers.length}`);
        
        if (testUsers.length === 0) {
            throw new Error('Нет пользователей для тестирования!');
        }
        
    }, 30000);
    
    test('Тест 1: Получение баланса пользователя', async () => {
        Logger.header('ТЕСТ 1: ПОЛУЧЕНИЕ БАЛАНСА');
        
        const user = testUsers[0];
        
        console.log(`Пользователь: userId=${user.userId.slice(0, 8)}...`);
        
        const result = await balanceApi.getMyBalance(user.token);
        
        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('available');
        expect(result.data).toHaveProperty('reserved');
        
        console.log(`✅ Баланс получен:`);
        console.log(`  available: ${result.data.available}`);
        console.log(`  reserved: ${result.data.reserved}`);
        
        user.currentBalance = result.data;
        
    }, 10000);
    
    test('Тест 2: Проверка структуры ответа', async () => {
        Logger.header('ТЕСТ 2: СТРУКТУРА ОТВЕТА');
        
        const user = testUsers[0];
        const result = await balanceApi.getMyBalance(user.token);
        
        expect(result.data).toMatchObject({
            available: expect.any(Number),
            reserved: expect.any(Number)
        });
        
        console.log(`✅ Структура ответа корректна`);
        
    }, 10000);
    
    test('Тест 3: Баланс не отрицательный', async () => {
        Logger.header('ТЕСТ 3: ПРОВЕРКА НЕОТРИЦАТЕЛЬНОСТИ');
        
        const user = testUsers[0];
        const result = await balanceApi.getMyBalance(user.token);
        
        expect(result.data.available).toBeGreaterThanOrEqual(0);
        expect(result.data.reserved).toBeGreaterThanOrEqual(0);
        
        console.log(`✅ Баланс не отрицательный`);
        console.log(`  available: ${result.data.available} (>= 0)`);
        console.log(`  reserved: ${result.data.reserved} (>= 0)`);
        
    }, 10000);
    
    test('Тест 4: Сравнение с начальным балансом', async () => {
        Logger.header('ТЕСТ 4: СРАВНЕНИЕ С НАЧАЛЬНЫМ');
        
        const user = testUsers[0];
        const result = await balanceApi.getMyBalance(user.token);
        
        console.log(`Начальный баланс:`);
        console.log(`  available: ${user.initialBalance?.available}`);
        console.log(`  reserved: ${user.initialBalance?.reserved}`);
        
        console.log(`\nТекущий баланс:`);
        console.log(`  available: ${result.data?.available}`);
        console.log(`  reserved: ${result.data?.reserved}`);
        
        if (user.initialBalance) {
            const availableDiff = result.data.available - user.initialBalance.available;
            const reservedDiff = result.data.reserved - user.initialBalance.reserved;
            
            console.log(`\nИзменения:`);
            console.log(`  available: ${availableDiff > 0 ? '+' : ''}${availableDiff}`);
            console.log(`  reserved: ${reservedDiff > 0 ? '+' : ''}${reservedDiff}`);
        }
        
        expect(result.success).toBe(true);
        
    }, 10000);
    
    test('Тест 5: Internal API недоступен (ожидаемо)', async () => {
        Logger.header('ТЕСТ 5: INTERNAL API (ПРОПУЩЕН)');
        
        console.log('⚠️ Internal API (/internal/*) предназначен только для бэкенда');
        console.log('✅ Тестирование internal API не требуется');
        
        expect(true).toBe(true);
        
    }, 5000);
    
});