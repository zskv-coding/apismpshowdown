import mysql from 'mysql2/promise';

export default async function handler(req, res) {
    // Allow CORS and disable caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Check for missing env vars
    const missingVars = [];
    if (!process.env.MYSQL_HOST) missingVars.push('MYSQL_HOST');
    if (!process.env.MYSQL_USER) missingVars.push('MYSQL_USER');
    if (!process.env.MYSQL_DATABASE) missingVars.push('MYSQL_DATABASE');
    
    if (missingVars.length > 0) {
        console.error('Missing Environment Variables:', missingVars);
        return res.status(500).json({ 
            error: 'Configuration Error', 
            message: `Missing: ${missingVars.join(', ')}` 
        });
    }

    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            port: process.env.MYSQL_PORT || 3306,
            connectTimeout: 10000
        });

        if (req.method === 'GET') {
            const gameList = [
                'Peckish Playoffs',
                'Parkour Run',
                'SMP Triathlon',
                'Aquatic Ambush',
                'Block Shuffle',
                'King of the Hill'
            ];
            // Count votes per game and get the ID of the first vote (Round ID)
            const [rows] = await connection.execute('SELECT game_name as game, COUNT(*) as votes FROM votes GROUP BY game_name');
            const [[sessionRow]] = await connection.execute('SELECT MIN(id) as sessionId FROM votes');
            
            // Check if voting is active
            const [[statusRow]] = await connection.execute('SELECT is_active FROM voting_status WHERE id = 1');
            const votingActive = statusRow ? Boolean(statusRow.is_active) : false;
            
            const votesMap = {};
            rows.forEach(row => votesMap[row.game] = row.votes);
            
            const results = gameList.map(game => ({
                game,
                votes: votesMap[game] || 0
            }));

            results.sort((a, b) => b.votes - a.votes);

            return res.status(200).json({
                sessionId: sessionRow?.sessionId || null,
                votingActive: votingActive,
                games: results
            });
        } else if (req.method === 'POST') {
            const { game } = req.body;
            if (!game) {
                return res.status(400).json({ error: 'Missing game name' });
            }

            // Insert a new vote record
            await connection.execute(
                'INSERT INTO votes (game_name) VALUES (?)',
                [game]
            );

            return res.status(200).json({ message: 'Vote cast successfully' });
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Database Error:', error);
        res.status(500).json({ 
            error: 'Database operation failed', 
            message: error.message 
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}
