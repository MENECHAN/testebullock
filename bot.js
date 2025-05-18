const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config.json');
const fs = require('fs');
const path = require('path');

// Import auto-updater
const CatalogAutoUpdater = require('./CatalogAutoUpdater');

// Check if required files exist
const requiredFiles = [
    './database/connection.js',
    './database/migrations.js',
    './handlers/buttonHandler.js',
    './handlers/selectMenuHandler.js',
    './handlers/modalHandler.js',
    './commands/slash/send-panel.js',
    './commands/slash/account.js'
];

console.log('Checking required files...');
for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
        console.error(`❌ Missing file: ${file}`);
        console.log('Please make sure all required files are in the correct location.');
        process.exit(1);
    }
}
console.log('✅ All required files found!');

// Import modules after verification
const Database = require('./database/connection');
const { runMigrations } = require('./database/migrations');

// Import handlers
const buttonHandler = require('./handlers/buttonHandler');
const selectMenuHandler = require('./handlers/selectMenuHandler');
const modalHandler = require('./handlers/modalHandler');

// Import commands
const sendPanelCommand = require('./commands/slash/send-panel');
const accountCommand = require('./commands/slash/account');
const priceManageCommand = require('./commands/slash/price-manage');

// Initialize client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize auto-updater
let catalogUpdater;

// Bot ready event
client.once('ready', async () => {
    console.log(`🚀 ${client.user.tag} está online!`);
    
    // Initialize database
    try {
        await Database.initialize();
        await runMigrations();
        console.log('✅ Database initialized!');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }

    // Initialize catalog auto-updater
    catalogUpdater = new CatalogAutoUpdater(client);
    console.log('🔄 Catalog auto-updater initialized!');

    // Clean up old backups every day
    setInterval(() => {
        catalogUpdater.cleanupOldBackups(7); // Keep backups for 7 days
    }, 24 * 60 * 60 * 1000); // Run every 24 hours
});

// Interaction handler
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            // Handle slash commands
            switch (interaction.commandName) {
                case 'send-panel':
                    await sendPanelCommand.execute(interaction);
                    break;
                case 'account':
                    await accountCommand.execute(interaction);
                    break;
                case 'catalog-manage':
                    await catalogUpdater.handleCatalogCommand(interaction);
                    break;
                default:
                    console.log(`Unknown command: ${interaction.commandName}`);
            }
        } else if (interaction.isButton()) {
            // Handle button interactions
            await buttonHandler.handle(interaction);
        } else if (interaction.isStringSelectMenu()) {
            // Handle select menu interactions
            await selectMenuHandler.handle(interaction);
        } else if (interaction.isModalSubmit()) {
            // Handle modal submissions
            await modalHandler.handle(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        
        const errorMessage = 'Houve um erro ao processar sua solicitação.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Error sending error message:', followUpError);
        }
    }
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down bot...');
    client.destroy();
    process.exit(0);
});

// Login with error handling
client.login(config.token).catch(error => {
    console.error('Failed to login:', error);
    console.log('Please check your bot token in config.json');
    process.exit(1);
});