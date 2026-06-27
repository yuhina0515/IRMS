const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'irms.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run('PRAGMA journal_mode=WAL');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Create table for custom actions
        db.run(`CREATE TABLE IF NOT EXISTS custom_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            protocol TEXT NOT NULL,
            targetAngle REAL NOT NULL,
            tolerance REAL NOT NULL,
            holdTimeMs INTEGER NOT NULL,
            triggerType TEXT NOT NULL
        )`);

        // Create table for rehabilitation sessions
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            startTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            endTime DATETIME,
            targetAngle REAL,
            tolerance REAL,
            holdTimeMs INTEGER,
            action TEXT
        )`);

        // Create table for sensor data within a session
        db.run(`CREATE TABLE IF NOT EXISTS sensor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sessionId INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            kneeAngle REAL,
            thighAngle REAL,
            shinAngle REAL,
            kneeRoll REAL,
            thighRoll REAL,
            shinRoll REAL,
            FOREIGN KEY (sessionId) REFERENCES sessions (id)
        )`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_sensor_data_sessionId ON sensor_data(sessionId)`);

        // Run schema migration for sessions table to add action column if it doesn't exist
        db.all(`PRAGMA table_info(sessions)`, (err, cols) => {
            if (err) {
                console.error('Error reading table info for sessions:', err.message);
                return;
            }
            if (cols && cols.length > 0) {
                const hasAction = cols.some(c => c.name === 'action');
                if (!hasAction) {
                    db.run(`ALTER TABLE sessions ADD COLUMN action TEXT`, (alterErr) => {
                        if (alterErr) console.error('Error adding action column to sessions:', alterErr.message);
                        else console.log('Successfully added action column to sessions.');
                    });
                }
            }
        });

        // Run schema migration to add thighAngle, shinAngle, and roll columns to existing sensor_data table if they don't exist
        db.all(`PRAGMA table_info(sensor_data)`, (err, cols) => {
            if (err) {
                console.error('Error reading table info for sensor_data:', err.message);
                return;
            }
            if (cols && cols.length > 0) {
                const hasThigh = cols.some(c => c.name === 'thighAngle');
                const hasShin = cols.some(c => c.name === 'shinAngle');
                const hasKneeRoll = cols.some(c => c.name === 'kneeRoll');
                const hasThighRoll = cols.some(c => c.name === 'thighRoll');
                const hasShinRoll = cols.some(c => c.name === 'shinRoll');
                
                if (!hasThigh) {
                    db.run(`ALTER TABLE sensor_data ADD COLUMN thighAngle REAL`, (alterErr) => {
                        if (alterErr) console.error('Error adding thighAngle column:', alterErr.message);
                        else console.log('Successfully added thighAngle column to sensor_data.');
                    });
                }
                if (!hasShin) {
                    db.run(`ALTER TABLE sensor_data ADD COLUMN shinAngle REAL`, (alterErr) => {
                        if (alterErr) console.error('Error adding shinAngle column:', alterErr.message);
                        else console.log('Successfully added shinAngle column to sensor_data.');
                    });
                }
                if (!hasKneeRoll) {
                    db.run(`ALTER TABLE sensor_data ADD COLUMN kneeRoll REAL`, (alterErr) => {
                        if (alterErr) console.error('Error adding kneeRoll column:', alterErr.message);
                        else console.log('Successfully added kneeRoll column to sensor_data.');
                    });
                }
                if (!hasThighRoll) {
                    db.run(`ALTER TABLE sensor_data ADD COLUMN thighRoll REAL`, (alterErr) => {
                        if (alterErr) console.error('Error adding thighRoll column:', alterErr.message);
                        else console.log('Successfully added thighRoll column to sensor_data.');
                    });
                }
                if (!hasShinRoll) {
                    db.run(`ALTER TABLE sensor_data ADD COLUMN shinRoll REAL`, (alterErr) => {
                        if (alterErr) console.error('Error adding shinRoll column:', alterErr.message);
                        else console.log('Successfully added shinRoll column to sensor_data.');
                    });
                }
            }
        });

        // Run schema migration for sessions table to add repsCompleted column if it doesn't exist
        db.all(`PRAGMA table_info(sessions)`, (err, cols) => {
            if (err) {
                console.error('Error reading table info for sessions:', err.message);
                return;
            }
            if (cols && cols.length > 0) {
                const hasRepsCompleted = cols.some(c => c.name === 'repsCompleted');
                if (!hasRepsCompleted) {
                    db.run(`ALTER TABLE sessions ADD COLUMN repsCompleted INTEGER DEFAULT 0`, (alterErr) => {
                        if (alterErr) console.error('Error adding repsCompleted column to sessions:', alterErr.message);
                        else console.log('Successfully added repsCompleted column to sessions.');
                    });
                }
            }
        });

        // Run schema migration for sessions table to add protocol column if it doesn't exist
        db.all(`PRAGMA table_info(sessions)`, (err, cols) => {
            if (err) {
                console.error('Error reading table info for sessions:', err.message);
                return;
            }
            if (cols && cols.length > 0) {
                const hasProtocol = cols.some(c => c.name === 'protocol');
                if (!hasProtocol) {
                    db.run(`ALTER TABLE sessions ADD COLUMN protocol TEXT`, (alterErr) => {
                        if (alterErr) console.error('Error adding protocol column to sessions:', alterErr.message);
                        else console.log('Successfully added protocol column to sessions.');
                    });
                }
            }
        });
    });
}

module.exports = db;
