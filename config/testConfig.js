module.exports = {
    //СЕТЕВЫЕ НАСТРОЙКИ
    BASE_URL: 'http://92.51.23.102:8080',
    GAME_URL: 'http://92.51.23.102:8081',
    
    //АВТОРИЗАЦИЯ
    ADMIN_TOKEN: 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJjODQ0MmUwNy1iYzJkLTQ0YTgtOTM1YS0zNjVlM2VlMjU4YWYiLCJyb2xlcyI6WyJhZG1pbiJdLCJ1c2VybmFtZSI6Im5pa2l0YVZzZVBvYnJpdG8iLCJpYXQiOjE3NzY5NjQ0MjEsImV4cCI6MTc3NzA1MDgyMX0.e-UJG0uZpCfhlr67PrtHR2COmJaFNjMtpPQKG-28Rfa_STW_BrRwg58h5vJgSh-PF0LyaBGG__TSToHmc1tA6g',
    
    //ГЕНЕРАЦИЯ ПОЛЬЗОВАТЕЛЕЙ
    USER_GENERATION: {
        count: 50,                          // Количество пользователей (N)
        phonePrefix: '+792283310',            // Префикс номера телефона
        usernamePrefix: 'dextytest',        // Префикс имени пользователя
        password: '123455cc',               // Общий пароль
        phonePadLength: 4                   // Длина дополнения номера (0001, 0002...)
    },
    
    //КОНФИГУРАЦИЯ КОМНАТЫ
    ROOM_CONFIG: {
        maxPlayers: 7,
        entryFeeAmount: 135000,
        winnerPayoutPercentage: 80,
        boostCostAmount: 17000,
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
    
    LOBBIES_COUNT: 12,
    PLAYERS_PER_LOBBY: 4, 
    
    //ТОКЕНЫ (заполняется автоматически)
    TOKENS: require('../tokens.json')
};