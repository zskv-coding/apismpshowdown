import mysql from 'mysql2/promise';
import formidable from 'formidable';
import fs from 'fs/promises';
import FormData from 'form-data';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const form = formidable({
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024,
        allowEmptyFiles: true,
        minFileSize: 0
    });

    try {
        const [fields, files] = await form.parse(req);
        
        const data = {};
        for (const key in fields) {
            data[key] = fields[key][0];
        }

        const username = data.username || data.mc_name || 'Unknown';
        const discord = data.discord || data.discord_name || 'Unknown';
        const type = data['app-type'] || 'General';
        const formStructure = data.form_structure ? JSON.parse(data.form_structure) : null;

        // DISCORD WEBHOOK
        const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
        if (DISCORD_WEBHOOK_URL) {
            try {
                const formatValue = (val) => {
                    const str = String(val || 'N/A');
                    return str.length > 1020 ? str.substring(0, 1020) + '...' : str;
                };

                const embeds = [];
                
                const headerEmbed = {
                    title: `📢 New ${type} Application`,
                    description: `**From:** ${username} (${discord})\n**Time:** ${new Date().toLocaleString()}`,
                    color: 0xFFA500,
                };

                if (data.drive_folder_url) {
                    headerEmbed.description += `\n\n📁 **[View Uploaded Files in Google Drive](${data.drive_folder_url})**`;
                }

                embeds.push(headerEmbed);

                if (formStructure) {
                    formStructure.forEach(section => {
                        const sectionFields = section.fields
                            .map(f => {
                                const answer = data[f.name];
                                if (!answer) return null;
                                return {
                                    name: f.label,
                                    value: formatValue(answer),
                                    inline: false
                                };
                            })
                            .filter(f => f !== null);

                        if (sectionFields.length > 0) {
                            embeds.push({
                                title: section.title,
                                color: 0xFFA500,
                                fields: sectionFields
                            });
                        }
                    });
                } else {
                    embeds.push({
                        title: "Application Details",
                        color: 0xFFA500,
                        fields: Object.entries(data)
                            .filter(([key]) => !['app-type', 'form_structure'].includes(key))
                            .map(([key, value]) => ({
                                name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                                value: formatValue(value),
                                inline: false
                            }))
                    });
                }

                const discordForm = new FormData();
                discordForm.append('payload_json', JSON.stringify({ embeds }));

                let hasFilesToAttach = false;
                for (const key in files) {
                    const fileArray = Array.isArray(files[key]) ? files[key] : [files[key]];
                    for (const file of fileArray) {
                        const wasUploadedToDrive = typeof data[key] === 'string' && data[key].includes('UPLOADED TO DRIVE');
                        
                        if (file && file.filepath && file.size > 0 && !wasUploadedToDrive) {
                            const fileContent = await fs.readFile(file.filepath);
                            discordForm.append(key, fileContent, { filename: file.originalFilename, contentType: file.mimetype });
                            hasFilesToAttach = true;
                        }
                    }
                }

                // Always use FormData headers — never override with application/json
                const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
                    method: 'POST',
                    body: discordForm,
                    headers: discordForm.getHeaders()
                });

                if (!discordResponse.ok) {
                    const errText = await discordResponse.text();
                    console.error('Discord rejected webhook:', discordResponse.status, errText);
                }

            } catch (discordError) {
                console.error('Discord Webhook Error:', discordError);
            }
        } else {
            console.warn('DISCORD_WEBHOOK_URL is not set in environment variables.');
        }

        // Save to MySQL
        let connection;
        try {
            if (process.env.MYSQL_HOST) {
                connection = await mysql.createConnection({
                    host: process.env.MYSQL_HOST,
                    user: process.env.MYSQL_USER,
                    password: process.env.MYSQL_PASSWORD,
                    database: process.env.MYSQL_DATABASE,
                    port: process.env.MYSQL_PORT || 3306,
                });

                await connection.execute(
                    'INSERT INTO applications (type, username, discord, form_data, has_files) VALUES (?, ?, ?, ?, ?)',
                    [type, username, discord, JSON.stringify(data), Object.keys(files).length > 0]
                );
            }
        } catch (dbError) {
            console.error('Database Error:', dbError);
        } finally {
            if (connection) await connection.end();
        }

        return res.status(200).json({ success: true, message: 'Application submitted successfully' });

    } catch (error) {
        console.error('Processing Error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to process application', 
            message: error.message 
        });
    }
}
