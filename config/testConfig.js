module.exports = {
    //СЕТЕВЫЕ НАСТРОЙКИ
    BASE_URL: 'http://92.51.23.102:8080',
    GAME_URL: 'http://92.51.23.102:8081',
    
    //АВТОРИЗАЦИЯ
    ADMIN_TOKEN: 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiI4ZTA3ZmQ5MC0yY2Q4LTQzNjItYjg4MS0yNGRhNTBmMWQwMWUiLCJyb2xlcyI6WyJhZG1pbiJdLCJ1c2VybmFtZSI6ItCd0LjQutC40Ycg0JrQvtGB0YLRi9C70LXQsiIsImlhdCI6MTc3Njk1ODE5NywiZXhwIjoxNzc3MDQ0NTk3fQ.YQMo3okk5bvKkXbABziZ8MNDnR-6yusdnVHNXSrLX-x4q-41QpoHb9aRVo_n6gPU9ZNo-IUGdA4yCYJDtAa0-g',
    
    //ГЕНЕРАЦИЯ ПОЛЬЗОВАТЕЛЕЙ
    USER_GENERATION: {
        count: 100,                          // Количество пользователей (N)
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
    
    LOBBIES_COUNT: 2,
    PLAYERS_PER_LOBBY: 5, 
    
    //ТОКЕНЫ (заполняется автоматически)
    TOKENS: require('../tokens.json')
};