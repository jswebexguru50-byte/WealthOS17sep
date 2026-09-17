const fs = require('fs');
const path = require('path');
const os = require('os');
const dl = path.join(os.homedir(), 'Downloads');

const files = fs.readdirSync(dl).filter(f => f.toLowerCase().includes('jdb184'));
console.log('JDB184 files in Downloads:', files);
