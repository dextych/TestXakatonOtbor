const config = require('../../config/testConfig');

const BASE_URL = config.BASE_URL;
const REGISTER_URL = `${BASE_URL}/api/v1/auth/register`;
const { count, phonePrefix, usernamePrefix, password, phonePadLength } = config.USER_GENERATION;

const generateUsers = (count) => {
    const users = [];
    for (let i = 1; i <= count; i++) {
        const phoneNum = i.toString().padStart(phonePadLength, '0');
        users.push({
            username: usernamePrefix + phoneNum,
            phone: phonePrefix + phoneNum,
            password: password
        });
    }
    return users;
};

const users = generateUsers(count);

async function registerUser(user, index) {
    try {
        const response = await fetch(REGISTER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
        
        if (response.ok) {
            console.log(`[${index + 1}/${count}] Зарегистрирован: ${user.username}`);
            return { success: true, user };
        } else {
            const error = await response.text();
            console.log(`[${index + 1}/${count}] Ошибка: ${user.username} - ${response.status}`);
            return { success: false, user, error };
        }
    } catch (error) {
        console.log(`[${index + 1}/${count}] Ошибка сети: ${user.username}`);
        return { success: false, user, error: error.message };
    }
}

async function registerAllParallel() {
    console.log(`Начинаем ПАРАЛЛЕЛЬНУЮ регистрацию ${count} пользователей...`);
    console.log(`   Префикс телефона: ${phonePrefix}`);
    console.log(`   Префикс имени: ${usernamePrefix}`);
    console.log(`   Пароль: ${password}\n`);
    
    const startTime = Date.now();
    
    // Создаем массив промисов для всех пользователей
    const promises = users.map((user, index) => registerUser(user, index));
    
    // Запускаем все запросы одновременно
    const results = await Promise.all(promises);
    
    // Статистика
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    const duration = (Date.now() - startTime) / 1000;
    
    console.log('\nСтатистика:');
    console.log(`   Успешно: ${successful}`);
    console.log(`   Ошибок: ${failed}`);
    console.log(`   Время: ${duration.toFixed(2)}с`);
    
    return results;
}

// Запуск
registerAllParallel();