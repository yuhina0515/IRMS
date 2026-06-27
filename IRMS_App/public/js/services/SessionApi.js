export const SessionApi = {
    async start(payload) {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to start session');
        return await res.json();
    },

    async end(sessionId, repsCompleted) {
        const res = await fetch(`/api/sessions/${sessionId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repsCompleted })
        });
        if (!res.ok) throw new Error('Failed to end session');
        return await res.json();
    },

    async flushBatchData(sessionId, readings) {
        const res = await fetch('/api/data/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, readings })
        });
        if (!res.ok) throw new Error('Failed to flush batch data');
        return await res.json();
    },

    async fetchHistory() {
        const res = await fetch('/api/sessions');
        if (!res.ok) throw new Error('Failed to fetch history');
        return await res.json();
    },

    async delete(sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete session');
        return await res.json();
    },

    async fetchSessionData(sessionId) {
        const res = await fetch(`/api/sessions/${sessionId}/data`);
        if (!res.ok) throw new Error('Failed to fetch session data');
        return await res.json();
    }
};
