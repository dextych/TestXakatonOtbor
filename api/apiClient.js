class ApiClient {
    constructor(baseUrl, defaultHeaders = {}) {
        this.baseUrl = baseUrl;
        this.defaultHeaders = defaultHeaders;
    }

    async request(method, path, { token, body, headers = {} } = {}) {
        const url = `${this.baseUrl}${path}`;
        const requestHeaders = {
            'Content-Type': 'application/json',
            'accept': '*/*',
            ...this.defaultHeaders,
            ...headers
        };
        
        if (token) {
            requestHeaders['Authorization'] = `Bearer ${token}`;
        }

        const options = {
            method,
            headers: requestHeaders
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        let data;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch {
                data = await response.text();
            }
        } else {
            data = await response.text();
        }

        return { response, data };
    }

    get(path, opts) { 
        return this.request('GET', path, opts); 
    }
    
    post(path, opts) { 
        return this.request('POST', path, opts); 
    }
    
    put(path, opts) { 
        return this.request('PUT', path, opts); 
    }
    
    delete(path, opts) { 
        return this.request('DELETE', path, opts); 
    }
}

module.exports = ApiClient;