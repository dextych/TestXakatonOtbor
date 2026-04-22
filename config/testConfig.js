module.exports = {
    //СЕТЕВЫЕ НАСТРОЙКИ
    BASE_URL: 'http://92.51.23.102:8080',
    GAME_URL: 'http://92.51.23.102:8081',
    
    //АВТОРИЗАЦИЯ
    ADMIN_TOKEN: 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxMmYyYzJkZi1iODNiLTQ5OWQtOTY3MC03NGIyYWEzOGExMTciLCJyb2xlcyI6WyJhZG1pbiJdLCJ1c2VybmFtZSI6ImRlbmlsIiwiaWF0IjoxNzc2OTAxMTQwLCJleHAiOjE3NzY5ODc1NDB9.cUAq0R4aV3yMX_tWTzEzReQ6LqU1JR_4HgDgLfZI-1f-tTo3jyDNs78hsHDjMMjHInQS0K9CwpZV6GGC9dZRhA',
    
    //ГЕНЕРАЦИЯ ПОЛЬЗОВАТЕЛЕЙ
    USER_GENERATION: {
        count: 2,                          // Количество пользователей (N)
        phonePrefix: '+7912383',            // Префикс номера телефона
        usernamePrefix: 'dextytest',        // Префикс имени пользователя
        password: '123455cc',               // Общий пароль
        phonePadLength: 4                   // Длина дополнения номера (0001, 0002...)
    },
    
    //КОНФИГУРАЦИЯ КОМНАТЫ
    ROOM_CONFIG: {
        maxPlayers: 5,
        entryFeeAmount: 100,
        winnerPayoutPercentage: 80,
        boostCostAmount: 20,
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
    
    LOBBIES_COUNT: 1,
    
    //ТОКЕНЫ (заполняется автоматически)
    TOKENS: require('../tokens.json')
};