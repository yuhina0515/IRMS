const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const sessionsRouter = require('./routes/sessions');
const dataRouter = require('./routes/data');
const customActionsRouter = require('./routes/customActions');

app.use('/api/sessions', sessionsRouter);
app.use('/api/data', dataRouter);
app.use('/api/custom_actions', customActionsRouter);

function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
            resolve(server);
        });
        server.on('error', (err) => {
            console.error(`Server failed to start: ${err.message}`);
            reject(err);
        });
    });
}

module.exports = { app, startServer };

if (require.main === module) {
    startServer();
}
