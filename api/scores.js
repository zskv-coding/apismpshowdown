import mysql from 'mysql2/promise';

export default async function handler(req, res) {
    // Allow CORS and disable caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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
            connectTimeout: 10000 // 10 seconds timeout
        });

        // Fetch Team Scores
        console.log('Fetching team scores...');
        const [teamScores] = await connection.execute('SELECT team_name as team, team_score as score FROM team_current_scores');
        console.log(`Fetched ${teamScores.length} team scores`);
        
        // Fetch Player Scores and Teams
        console.log('Fetching player scores...');
        const [playerData] = await connection.execute('SELECT player_username as username, team_name as team, current_score as score FROM player_current_scores');
        console.log(`Fetched ${playerData.length} player scores`);

        res.status(200).json({
            teams: teamScores,
            players: playerData
        });
    } catch (error) {
        console.error('Database Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch scores', 
            message: error.message 
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}
