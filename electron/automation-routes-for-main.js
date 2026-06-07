// Add this to electron/main.js if /automations is still returning 404.
// Use expressApp, not Electron's app.

expressApp.get('/automations', async (req, res) => {
    try {
        const rules = await readJsonl('automations.jsonl');
        res.json(rules);
    } catch (error) {
        console.error('Failed to fetch automations:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch automations.',
        });
    }
});

expressApp.post('/automations', async (req, res) => {
    try {
        const rules = await readJsonl('automations.jsonl');

        const newRule = {
            ...req.body,
            id: req.body.id || `automation-${Date.now()}`,
            runCount: req.body.runCount || 0,
            createdAt: req.body.createdAt || Date.now(),
        };

        rules.push(newRule);
        await writeJsonl('automations.jsonl', rules);

        res.status(201).json(newRule);
    } catch (error) {
        console.error('Failed to create automation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create automation.',
        });
    }
});

expressApp.put('/automations/:id', async (req, res) => {
    try {
        const rules = await readJsonl('automations.jsonl');
        const index = rules.findIndex(item => item.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Automation not found.',
            });
        }

        rules[index] = {
            ...rules[index],
            ...req.body,
            id: rules[index].id,
        };

        await writeJsonl('automations.jsonl', rules);
        res.json(rules[index]);
    } catch (error) {
        console.error('Failed to update automation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update automation.',
        });
    }
});

expressApp.delete('/automations/:id', async (req, res) => {
    try {
        const rules = await readJsonl('automations.jsonl');
        const filteredRules = rules.filter(item => item.id !== req.params.id);

        await writeJsonl('automations.jsonl', filteredRules);
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete automation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete automation.',
        });
    }
});
