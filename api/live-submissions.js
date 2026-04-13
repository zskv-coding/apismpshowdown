import mysql from 'mysql2/promise';

export default async function handler(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'POST') {
        try {
            const { mc_username, selected_player, platform, other_platform, social_link } = req.body;
            
            const data = {
                mc_username,
                selected_player,
                platform,
                other_platform: platform === 'other' ? other_platform : null,
                social_link,
                submitted_at: new Date().toISOString()
            };

            // Discord Webhook
            const DISCORD_WEBHOOK_URL = process.env.LIVE_SUBMISSIONS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
            if (DISCORD_WEBHOOK_URL) {
                const embed = {
                    title: "🎥 New Live Stream Submission",
                    color: 0x9146FF, // Twitch Purple
                    fields: [
                        { name: "Minecraft Username", value: mc_username || "N/A", inline: true },
                        { name: "Selected Player", value: selected_player || "N/A", inline: true },
                        { name: "Platform", value: platform === 'other' ? `Other: ${other_platform}` : platform, inline: true },
                        { name: "Social Media Link", value: social_link || "N/A" }
                    ],
                    timestamp: new Date().toISOString()
                };

                await fetch(DISCORD_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ embeds: [embed] })
                });
            }

            // Save to MySQL
            if (process.env.MYSQL_HOST) {
                const connection = await mysql.createConnection({
                    host: process.env.MYSQL_HOST,
                    user: process.env.MYSQL_USER,
                    password: process.env.MYSQL_PASSWORD,
                    database: process.env.MYSQL_DATABASE,
                    port: process.env.MYSQL_PORT || 3306,
                });

                await connection.execute(
                    'INSERT INTO applications (type, username, discord, form_data) VALUES (?, ?, ?, ?)',
                    ['Live Submission', mc_username, selected_player, JSON.stringify(data)]
                );
                await connection.end();
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Submission Error:', error);
            return res.status(500).json({ error: 'Failed to submit' });
        }
    }

    if (req.method === 'GET') {
        const auth = req.headers.authorization;
        const expectedAuth = Buffer.from('zskvbusiness@gmail.com:SMPShowdownAdminSection2024124').toString('base64');
        
        if (auth !== `Basic ${expectedAuth}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            if (process.env.MYSQL_HOST) {
                const connection = await mysql.createConnection({
                    host: process.env.MYSQL_HOST,
                    user: process.env.MYSQL_USER,
                    password: process.env.MYSQL_PASSWORD,
                    database: process.env.MYSQL_DATABASE,
                    port: process.env.MYSQL_PORT || 3306,
                });

                const [rows] = await connection.execute(
                    "SELECT * FROM applications WHERE type = 'Live Submission' ORDER BY id DESC"
                );
                await connection.end();

                return res.status(200).json(rows.map(row => ({
                    id: row.id,
                    data: typeof row.form_data === 'string' ? JSON.parse(row.form_data) : row.form_data,
                    created_at: row.created_at
                })));
            } else {
                return res.status(200).json([]);
            }
        } catch (error) {
            console.error('Fetch Error:', error);
            return res.status(500).json({ error: 'Failed to fetch submissions' });
        }
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
}
