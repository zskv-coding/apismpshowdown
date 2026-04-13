import mysql from 'mysql2/promise';

export default async function handler(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    let connection;
    try {
        if (!process.env.MYSQL_HOST) {
            throw new Error("Missing MYSQL_HOST environment variable. Please check Vercel settings.");
        }

        connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            port: process.env.MYSQL_PORT || 3306,
        });

        // Ensure table exists
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(50),
                username VARCHAR(100),
                discord VARCHAR(100),
                form_data JSON,
                has_files BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        if (req.method === 'POST') {
            const { mc_username, selected_player, platform, other_platform, social_link } = req.body;
            const data = { mc_username, selected_player, platform, other_platform, social_link, submitted_at: new Date().toISOString() };

            // Discord Notification
            const webhook = process.env.LIVE_SUBMISSIONS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
            if (webhook) {
                await fetch(webhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        embeds: [{
                            title: "🎥 New Live Submission",
                            color: 0x9146FF,
                            fields: [
                                { name: "MC User", value: mc_username || "N/A", inline: true },
                                { name: "Player", value: selected_player || "N/A", inline: true },
                                { name: "Link", value: social_link || "N/A" }
                            ]
                        }]
                    })
                }).catch(err => console.error("Webhook failed:", err));
            }

            await connection.execute(
                'INSERT INTO applications (type, username, discord, form_data) VALUES (?, ?, ?, ?)',
                ['Live Submission', mc_username, selected_player, JSON.stringify(data)]
            );
            return res.status(200).json({ success: true });
        }

        if (req.method === 'GET') {
            const auth = req.headers.authorization;
            const expectedAuth = Buffer.from('zskvbusiness@gmail.com:SMPShowdownAdminSection2024124').toString('base64');
            if (auth !== `Basic ${expectedAuth}`) return res.status(401).json({ error: 'Unauthorized' });

            const [rows] = await connection.execute("SELECT * FROM applications WHERE type = 'Live Submission' ORDER BY id DESC");
            return res.status(200).json(rows.map(row => ({
                id: row.id,
                data: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data,
                created_at: row.created_at
            })));
        }

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message });
    } finally {
        if (connection) await connection.end();
    }
}
