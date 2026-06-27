const express = require('express');
const router = express.Router();
const db = require('../db');

// API: Add sensor data (single point)
router.post('/', (req, res) => {
    const { sessionId, kneeAngle, thighAngle, shinAngle, kneeRoll, thighRoll, shinRoll, timestamp } = req.body;
    if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
    }
    
    const ts = timestamp || new Date().toISOString();
    db.run(
        `INSERT INTO sensor_data (sessionId, kneeAngle, thighAngle, shinAngle, kneeRoll, thighRoll, shinRoll, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, kneeAngle, thighAngle ?? null, shinAngle ?? null, kneeRoll ?? null, thighRoll ?? null, shinRoll ?? null, ts],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// API: Add sensor data in batches (highly optimized, runs inside SQL Transaction)
router.post('/batch', (req, res) => {
    const { sessionId, readings } = req.body;
    if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
    }
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
        res.status(400).json({ error: 'readings array is required and cannot be empty' });
        return;
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION", (beginErr) => {
            if (beginErr) {
                res.status(500).json({ error: beginErr.message });
                return;
            }

            const stmt = db.prepare(`INSERT INTO sensor_data (sessionId, kneeAngle, thighAngle, shinAngle, kneeRoll, thighRoll, shinRoll, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            let hasError = false;
            let errMsg = "";

            for (const r of readings) {
                const ts = r.timestamp || new Date().toISOString();
                stmt.run([sessionId, r.kneeAngle, r.thighAngle ?? null, r.shinAngle ?? null, r.kneeRoll ?? null, r.thighRoll ?? null, r.shinRoll ?? null, ts], (runErr) => {
                    if (runErr && !hasError) {
                        hasError = true;
                        errMsg = runErr.message;
                    }
                });
            }

            stmt.finalize((finalizeErr) => {
                if (hasError || finalizeErr) {
                    db.run("ROLLBACK", () => {
                        res.status(500).json({ error: errMsg || (finalizeErr ? finalizeErr.message : "Finalize error") });
                    });
                } else {
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) {
                            res.status(500).json({ error: commitErr.message });
                        } else {
                            res.json({ success: true, count: readings.length });
                        }
                    });
                }
            });
        });
    });
});

module.exports = router;
