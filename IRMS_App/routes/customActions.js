const express = require('express');
const router = express.Router();
const db = require('../db');

// API: Get all custom actions
router.get('/', (req, res) => {
    db.all(`SELECT * FROM custom_actions ORDER BY id ASC`, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Create a custom action
router.post('/', (req, res) => {
    const { name, protocol, targetAngle, tolerance, holdTimeMs, triggerType } = req.body;
    if (!name || !protocol || targetAngle === undefined || tolerance === undefined || holdTimeMs === undefined || !triggerType) {
        res.status(400).json({ error: 'Missing required custom action parameters' });
        return;
    }
    db.run(
        `INSERT INTO custom_actions (name, protocol, targetAngle, tolerance, holdTimeMs, triggerType) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, protocol, targetAngle, tolerance, holdTimeMs, triggerType],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// API: Update a custom action
router.put('/:id', (req, res) => {
    const actionId = req.params.id;
    const { name, protocol, targetAngle, tolerance, holdTimeMs, triggerType } = req.body;
    if (!name || !protocol || targetAngle === undefined || tolerance === undefined || holdTimeMs === undefined || !triggerType) {
        res.status(400).json({ error: 'Missing required custom action parameters' });
        return;
    }
    db.run(
        `UPDATE custom_actions SET name = ?, protocol = ?, targetAngle = ?, tolerance = ?, holdTimeMs = ?, triggerType = ? WHERE id = ?`,
        [name, protocol, targetAngle, tolerance, holdTimeMs, triggerType, actionId],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

// API: Delete a custom action
router.delete('/:id', (req, res) => {
    const actionId = req.params.id;
    db.run(
        `DELETE FROM custom_actions WHERE id = ?`,
        [actionId],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ success: true });
        }
    );
});

module.exports = router;
