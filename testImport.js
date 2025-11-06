const path = require('path');

console.log('Current directory:', __dirname);
console.log('Looking for file at:', path.resolve(__dirname, './src/jobQueue.js'));

try {
  const jobQueueModule = require('./src/jobQueue');
  console.log('Module contents:', jobQueueModule);
} catch (error) {
  console.error('Error loading jobQueue.js:', error.message);
}
