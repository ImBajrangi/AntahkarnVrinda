const { startServer } = require('./server');
const path = require('path');
const os = require('os');

const uploadsDir = path.join(os.homedir(), 'Downloads', 'LocalShare');
const staticDistDir = path.join(__dirname, 'dist');

startServer(uploadsDir, staticDistDir, 3000)
    .then(({ port }) => {
        console.log(`Standalone Backend running on port ${port}`);
    })
    .catch(err => {
        console.error('Failed to start standalone server:', err);
    });
