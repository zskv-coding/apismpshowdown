const mysql = require('mysql2/promise');

export default async function handler(req, res) {
    // Allow CORS for your GitHub Pages domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        port: process.env.MYSQL_PORT || 3306
    });

    try {
        // Fetch Team Scores
        const [teamScores] = await connection.execute('SELECT team_name as team, team_score as score FROM team_current_scores');
        
        // Fetch Player Scores and Teams
        const [playerData] = await connection.execute('SELECT player_username as username, team_name as team, current_score as score FROM player_current_scores');

        res.status(200).json({
            teams: teamScores,
            players: playerData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        await connection.end();
    }
}
