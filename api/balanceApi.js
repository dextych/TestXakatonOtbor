const ApiClient = require('./apiClient');
const config = require('../config/testConfig');

class BalanceApi {
    constructor() {
        this.client = new ApiClient(config.BASE_URL);
    }

    
    // Получить баланс текущего пользователя
    async getMyBalance(userToken) {
        const { response, data } = await this.client.get('/api/v1/users/me/balance', {
            token: userToken
        });
        
        return {
            success: response.ok,
            status: response.status,
            data: data // { available, reserved }
        };
    }
}

module.exports = new BalanceApi();