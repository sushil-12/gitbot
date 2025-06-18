// api/mistral.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages, options } = req.body;
    const apiKey = process.env.MISTRAL_API_KEY; // Set this in Vercel dashboard

    if (!apiKey) {
        return res.status(500).json({ error: 'Mistral API key not configured on server.' });
    }

    try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: options?.model || 'mistral-large-latest',
                messages,
                max_tokens: options?.max_tokens || 1000,
                temperature: options?.temperature || 0.7
            })
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: await response.text() });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}