module.exports = {
    //СЕТЕВЫЕ НАСТРОЙКИ
    BASE_URL: 'http://92.51.23.102:8080',
    GAME_URL: 'http://92.51.23.102:8081',
    
    //АВТОРИЗАЦИЯ
    ADMIN_TOKEN: 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI2NGYzNjZmZS1hM2VkLTRhYTQtOTQwZi1lNGRkZTI5NzMxZjEiLCJyb2xlcyI6WyJhZG1pbiJdLCJ1c2VybmFtZSI6IkRleHlMb3JubiIsImlhdCI6MTc3Njk0NDk5NiwiZXhwIjoxNzc3MDMxMzk2fQ.mHADoC3ZSYaNbh6ea0dOGAZMd9o2iIr1WvMhpIztaB31h336mpa_b6W4jZubIiKI8-b38-fQUGJXiKd6QIZhCw',
    
    //ГЕНЕРАЦИЯ ПОЛЬЗОВАТЕЛЕЙ
    USER_GENERATION: {
        count: 100,                          // Количество пользователей (N)
        phonePrefix: '+79228310',            // Префикс номера телефона
        usernamePrefix: 'dexytest',        // Префикс имени пользователя
        password: '123455cc',               // Общий пароль
        phonePadLength: 4                   // Длина дополнения номера (0001, 0002...)
    },
    
    //КОНФИГУРАЦИЯ КОМНАТЫ
    ROOM_CONFIG: {
        maxPlayers: 7,
        entryFeeAmount: 35000,
        winnerPayoutPercentage: 80,
        boostCostAmount: 7000,
        boostEnabled: true,
        maxBarrelSelection: 3
    },

        //КОНФИГУРАЦИЯ КОМНАТЫ ПО РАСПИСАНИЮ
    SCHEDULED_ROOM_CONFIG: {
        name: 'Комната с повтором каждые 30 мин',
        config: {
            maxPlayers: 7,
            entryFeeAmount: 33,
            winnerPayoutPercentage: 33,
            boostCostAmount: 20,
            boostEnabled: true,
            maxBarrelSelection: 3,
            repeatInterval: 'EVERY_30_MIN',
            confirmWarnings: true
        }
    },

    //КОНФИГУРАЦИЯ ДЛЯ ПОИСКА ПОВТОРНЫХ КОМНАТ
    REPEAT_ROOM_SEARCH_CONFIG: {
        maxPlayers: 7,
        entryFeeAmount: 33,
        winnerPayoutPercentage: 33,
        boostCostAmount: 20,
        repeatInterval: 'EVERY_30_MIN'
    },
    
    LOBBIES_COUNT: 20,
    PLAYERS_PER_LOBBY: 5, 
    
    //ТОКЕНЫ (заполняется автоматически)
    TOKENS: require('../tokens.json')
};