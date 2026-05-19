const fs = require('fs');
const path = require('path');

const apiStorage = {
  data: {},
  
  save(api) {
    this.data[api.url] = api;
    this.persist();
  },
  
  get(url) {
    return this.data[url];
  },
  
  delete(url) {
    delete this.data[url];
    this.persist();
  },
  
  search(keyword) {
    const results = [];
    for (const url in this.data) {
      const api = this.data[url];
      if (this.matchesKeyword(api, keyword)) {
        results.push(api);
      }
    }
    return results;
  },
  
  matchesKeyword(api, keyword) {
    const searchStr = `${api.url} ${api.json?.['接口描述'] || ''} ${api.json?.['请求参数结构'] || ''}`.toLowerCase();
    return searchStr.includes(keyword.toLowerCase());
  },
  
  getAll() {
    return Object.values(this.data);
  },
  
  persist() {
    try {
      fs.writeFileSync(path.join(__dirname, '..', 'Data', 'api_data.json'), JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Failed to persist API data:', error);
    }
  },
  
  load() {
    try {
      const data = fs.readFileSync(path.join(__dirname, '..', 'Data', 'api_data.json'), 'utf8');
      this.data = JSON.parse(data);
    } catch (error) {
      this.data = {};
    }
  }
};

apiStorage.dataPath = path.join(__dirname, '..', 'Data', 'api_data.json');
apiStorage.load();
module.exports = apiStorage;