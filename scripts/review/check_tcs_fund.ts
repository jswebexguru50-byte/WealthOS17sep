import { FundamentalModuleAdapter } from '../../src/server/services/intelligence/modules/FundamentalModuleAdapter.js';

const res = await FundamentalModuleAdapter.getInstance().run('TCS');
console.log('TCS FundamentalModuleAdapter result keys:');
console.log('status:', res.status);
console.log('result keys:', res.result ? Object.keys(res.result) : null);
console.log('result:', JSON.stringify(res.result, null, 2));
