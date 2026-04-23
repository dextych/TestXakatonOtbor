const config = require('../../config/testConfig');
const fs = require('fs');
const path = require('path');

const BASE_URL = config.BASE_URL;
const { count, phonePrefix, password, phonePadLength } = config.USER_GENERATION;

async function quickGetTokens() {
    console.log(`🚀 Начинаем ПАРАЛЛЕЛЬНОЕ получение токенов для ${count} пользователей...`);
    console.log(`   Префикс телефона: ${phonePrefix}\n`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 1; i <= count; i++) {
        const phone = phonePrefix + i.toString().padStart(phonePadLength, '0');
        promises.push(
            fetch(`${BASE_URL}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            })
            .then(async (r) => {
                const data = await r.json();
                if (r.ok) {
                    console.log(`✅ [${i}/${count}] Токен получен: ${phone}`);
                    return { phone, token: data.token || data.accessToken };
                } else {
                    console.log(`❌ [${i}/${count}] Ошибка: ${phone} - ${r.status}`);
                    return null;
                }
            })
            .catch((error) => {
                console.log(`❌ [${i}/${count}] Ошибка сети: ${phone}`);
                return null;
            })
        );
    }
    
    const tokens = (await Promise.all(promises)).filter(t => t && t.token);
    
    const duration = (Date.now() - startTime) / 1000;
    
    // Сохраняем в файл
    const outputPath = path.join(__dirname, '../..', 'tokens.json');
    fs.writeFileSync(outputPath, JSON.stringify(tokens, null, 2));
    
    console.log('\n📊 Статистика:');
    console.log(`   ✅ Получено токенов: ${tokens.length}/${count}`);
    console.log(`   ❌ Ошибок: ${count - tokens.length}`);
    console.log(`   ⏱️ Время: ${duration.toFixed(2)}с`);
    console.log(`   💾 Сохранено в: ${outputPath}`);
}

quickGetTokens();