const fs = require('fs');
const path = require('path');

function loadConfig() {
  const readmePath = path.join(__dirname, '..', 'Readme.txt');
  try {
    const content = fs.readFileSync(readmePath, 'utf8');
    const config = {
      Elua: true,
      Passwd: 'Memory726'
    };
    
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('Elua = ')) {
        const value = trimmedLine.split('=')[1].trim();
        config.Elua = value === 'True';
      } else if (trimmedLine.startsWith('Passwd = ')) {
        const value = trimmedLine.split('=')[1].trim();
        config.Passwd = value;
      }
    }
    
    return config;
  } catch (error) {
    console.error('Failed to load config from Readme.txt:', error);
    return {
      Elua: true,
      Passwd: 'Memory726'
    };
  }
}

module.exports = loadConfig();