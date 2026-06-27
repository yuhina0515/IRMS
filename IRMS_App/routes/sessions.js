const express = require('express');
const router = express.Router();
const db = require('../db');

// API: Start a new session
router.post('/', (req, res) => {
    console.log('POST /api/sessions body:', req.body);
    const { targetAngle, tolerance, holdTimeMs, action, protocol } = req.body;
    db.run(
        `INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, action, protocol) VALUES (?, ?, ?, ?, ?)`,
        [targetAngle, tolerance, holdTimeMs, action ?? null, protocol ?? null],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ sessionId: this.lastID });
        }
    );
});

// API: End a session
router.post('/:id/end', (req, res) => {
    const sessionId = req.params.id;
    db.run(
        `UPDATE sessions SET endTime = CURRENT_TIMESTAMP, repsCompleted = ? WHERE id = ?`,
        [req.body.repsCompleted ?? 0, sessionId],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

// API: Get historical sessions
router.get('/', (req, res) => {
    db.all(`SELECT * FROM sessions ORDER BY startTime DESC`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Get data for a session
router.get('/:id/data', (req, res) => {
    const sessionId = req.params.id;
    db.all(`SELECT * FROM sensor_data WHERE sessionId = ? ORDER BY timestamp ASC`, [sessionId], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Delete a session and its sensor data
router.delete('/:id', (req, res) => {
    const sessionId = req.params.id;
    db.run(`DELETE FROM sensor_data WHERE sessionId = ?`, [sessionId], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId], function(err2) {
            if (err2) {
                res.status(500).json({ error: err2.message });
                return;
            }
            res.json({ success: true });
        });
    });
});

module.exports = router;
