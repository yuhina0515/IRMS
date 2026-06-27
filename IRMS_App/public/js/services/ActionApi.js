export const ActionApi = {
    async fetchAll() {
        try {
            const res = await fetch('/api/custom_actions');
            if (!res.ok) throw new Error('Failed to fetch custom actions');
            return await res.json();
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async create(payload) {
        const res = await fetch('/api/custom_actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to create action');
        return await res.json();
    },

    async update(id, payload) {
        const res = await fetch(`/api/custom_actions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to update action');
        return await res.json();
    },

    async delete(id) {
        const res = await fetch(`/api/custom_actions/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete action');
        return await res.json();
    }
};
