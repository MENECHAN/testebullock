const { Client, GatewayIntentBits } = require('discord.js');
const OrderLog = require('./models/OrderLog');
const OrderService = require('./services/orderService');
const config = require('./config.json');
const fs = require('fs');
const path = require('path');
const { applyDatabaseFixes } = require('./database/schema-fix');
const revenueCommand = require('./commands/slash/revenue');
const friendshipLogsCommand = require('./commands/slash/friendship-logs');

// Import auto-updater
const CatalogAutoUpdater = require('./CatalogAutoUpdater');

// ⭐ IMPORT DO NOVO SERVIÇO DE NOTIFICAÇÃO
const FriendshipNotificationService = require('./services/FriendshipNotificationService.js');

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

// Initialize services
let catalogUpdater;
let friendshipNotificationService; // ⭐ NOVA VARIÁVEL

// Bot ready event
client.once('ready', async () => {
    console.log(`🚀 ${client.user.tag} está online!`);

    // Initialize database
    try {
        await Database.initialize();
        await applyDatabaseFixes();
        await runMigrations();
        console.log('✅ Database initialized!');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }

    // Initialize catalog auto-updater
    catalogUpdater = new CatalogAutoUpdater(client);
    console.log('🔄 Catalog auto-updater initialized!');

    // ⭐ INICIALIZAR SERVIÇO DE NOTIFICAÇÃO DE AMIZADES
    friendshipNotificationService = new FriendshipNotificationService(client);
    friendshipNotificationService.start();
    console.log('🔔 Friendship notification service initialized!');

    // Clean up old backups every day
    setInterval(() => {
        catalogUpdater.cleanupOldBackups(7); // Keep backups for 7 days
    }, 24 * 60 * 60 * 1000); // Run every 24 hours
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.attachments.size > 0) {
        console.log(`[DEBUG] Message with attachment in channel ${message.channel.id}`);

        try {
            const order = await OrderLog.findActiveOrderByChannelId(
                message.channel.id,
                'PENDING_PAYMENT_PROOF'
            );

            console.log(`[DEBUG] Order found:`, order ? `ID ${order.id}` : 'none');

            if (order && order.user_id === message.author.id) {
                console.log(`[DEBUG] Processing payment proof for order ${order.id}`);

                const attachment = message.attachments.first();
                if (attachment && attachment.contentType && attachment.contentType.startsWith('image/')) {
                    console.log(`[DEBUG] Valid image attachment received: ${attachment.url}`);

                    // Confirmar recebimento
                    await message.reply('✅ Comprovante de pagamento recebido! Nossa equipe irá analisar em breve.');

                    // ⭐ ATUALIZAR COM FALLBACK DIRETO
                    console.log(`[DEBUG] Updating order ${order.id} with payment proof...`);

                    let updateSuccess = false;

                    try {
                        // Tentar método normal com timeout
                        updateSuccess = await Promise.race([
                            OrderLog.addPaymentProof(order.id, attachment.url),
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('addPaymentProof timeout')), 5000)
                            )
                        ]);

                        console.log(`[DEBUG] OrderLog.addPaymentProof result:`, updateSuccess);

                    } catch (error) {
                        console.error(`[ERROR] OrderLog.addPaymentProof failed:`, error);
                        console.log(`[DEBUG] Trying direct database update...`);

                        // ⭐ FALLBACK: Atualização direta no banco
                        try {
                            const db = require('./database/connection');
                            const directResult = await db.run(
                                'UPDATE order_logs SET payment_proof_url = ?, status = ? WHERE id = ?',
                                [attachment.url, 'PENDING_MANUAL_APPROVAL', order.id]
                            );

                            updateSuccess = directResult.changes > 0;
                            console.log(`[DEBUG] Direct database update result:`, updateSuccess);

                        } catch (directError) {
                            console.error(`[ERROR] Direct database update failed:`, directError);
                            await message.followUp('❌ Erro ao processar comprovante. Tente novamente.');
                            return;
                        }
                    }

                    if (!updateSuccess) {
                        console.error(`[ERROR] Failed to update order ${order.id}`);
                        await message.followUp('❌ Erro ao atualizar pedido. Contate o suporte.');
                        return;
                    }

                    // ⭐ ENVIAR PARA ADMIN
                    console.log(`[DEBUG] Sending order ${order.id} to admin approval...`);

                    try {
                        // Verificar se OrderService existe
                        if (!OrderService || typeof OrderService.sendOrderToAdminApproval !== 'function') {
                            console.error(`[ERROR] OrderService not available, using manual notification`);

                            // ⭐ FALLBACK: Notificação manual
                            const adminChannelId = config.adminLogChannelId || config.approvalNeededChannelId || config.orderApprovalChannelId;
                            if (adminChannelId) {
                                const adminChannel = await message.client.channels.fetch(adminChannelId);
                                if (adminChannel) {
                                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

                                    const quickEmbed = new EmbedBuilder()
                                        .setTitle('🧾 Novo Comprovante')
                                        .setDescription(`**Pedido ID:** ${order.id}\n**Canal:** <#${message.channel.id}>`)
                                        .setImage(attachment.url)
                                        .setColor('#faa61a');

                                    const quickRow = new ActionRowBuilder()
                                        .addComponents(
                                            new ButtonBuilder()
                                                .setCustomId(`approve_order_${order.id}`)
                                                .setLabel('✅ Aprovar')
                                                .setStyle(ButtonStyle.Success),
                                            new ButtonBuilder()
                                                .setCustomId(`reject_order_${order.id}`)
                                                .setLabel('❌ Rejeitar')
                                                .setStyle(ButtonStyle.Danger)
                                        );

                                    await adminChannel.send({
                                        content: `🔔 **Comprovante recebido** - Pedido #${order.id}`,
                                        embeds: [quickEmbed],
                                        components: [quickRow]
                                    });

                                    console.log(`[DEBUG] Manual admin notification sent`);
                                }
                            }

                        } else {
                            // Usar OrderService normalmente
                            await OrderService.sendOrderToAdminApproval(message.client, order.id);
                            console.log(`[DEBUG] OrderService notification sent`);
                        }

                    } catch (adminError) {
                        console.error(`[ERROR] Admin notification failed:`, adminError);
                        // Não falhar aqui, apenas logar
                    }

                    console.log(`[DEBUG] Payment proof processing completed for order ${order.id}`);

                } else {
                    console.log(`[DEBUG] Invalid attachment type:`, attachment?.contentType);
                    await message.reply('⚠️ Por favor, envie um comprovante em formato de imagem (PNG, JPG, etc.).');
                }
            }
        } catch (error) {
            console.error('[ERROR] Error processing payment proof:', error);
            console.error('[ERROR] Error stack:', error.stack);
        }
    }
});

// Interaction handler
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            // Handle slash commands
            switch (interaction.commandName) {
                case 'friendship-logs':
                    await friendshipLogsCommand.execute(interaction);
                    break;
                case 'revenue':
                    await revenueCommand.execute(interaction);
                    break;
                case 'send-panel':
                    await sendPanelCommand.execute(interaction);
                    break;
                case 'account':
                    await accountCommand.execute(interaction);
                    break;
                case 'catalog-manage':
                    await catalogUpdater.handleCatalogCommand(interaction);
                    break;
                // ⭐ NOVO COMANDO PARA NOTIFICAÇÕES
                case 'friendship-notifications':
                    await handleFriendshipNotificationCommand(interaction);
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

// ⭐ HANDLER PARA COMANDOS DE NOTIFICAÇÃO
async function handleFriendshipNotificationCommand(interaction) {
    // Check if user has admin role
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
        return await interaction.reply({
            content: '❌ Você não tem permissão para usar este comando.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'stats':
            await handleNotificationStats(interaction);
            break;
        case 'check':
            await handleManualCheck(interaction);
            break;
        case 'test':
            await handleTestNotification(interaction);
            break;
        case 'reset':
            await handleResetNotifications(interaction);
            break;
    }
}

async function handleNotificationStats(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const stats = await friendshipNotificationService.getStatistics();

        if (!stats) {
            return await interaction.editReply({
                content: '❌ Erro ao obter estatísticas.'
            });
        }

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setTitle('📊 Estatísticas do Serviço de Notificação')
            .addFields([
                { name: '👥 Total de Amizades', value: stats.totalFriendships.toString(), inline: true },
                { name: '✅ Amizades Elegíveis', value: `${stats.eligibleFriendships} (${stats.minDays}+ dias)`, inline: true },
                { name: '🔔 Já Notificadas', value: stats.notifiedFriendships.toString(), inline: true },
                { name: '⏳ Pendentes', value: stats.pendingNotifications.toString(), inline: true },
                { name: '🔄 Status do Serviço', value: stats.isRunning ? '🟢 Ativo' : '🔴 Inativo', inline: true },
                { name: '⏰ Período Mínimo', value: `${stats.minDays} dias`, inline: true }
            ])
            .setColor('#5865f2')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error getting notification stats:', error);
        await interaction.editReply({
            content: '❌ Erro ao obter estatísticas.'
        });
    }
}

async function handleManualCheck(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        await interaction.editReply({
            content: '🔄 Verificando amizades elegíveis...'
        });

        await friendshipNotificationService.checkEligibleFriendships();

        await interaction.editReply({
            content: '✅ Verificação concluída! Verifique os logs para detalhes.'
        });

    } catch (error) {
        console.error('Error running manual check:', error);
        await interaction.editReply({
            content: '❌ Erro ao executar verificação manual.'
        });
    }
}

async function handleTestNotification(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const friendshipId = interaction.options.getInteger('friendship_id');

        await interaction.editReply({
            content: `🔄 Testando notificação para amizade ${friendshipId}...`
        });

        const success = await friendshipNotificationService.checkSpecificFriendship(friendshipId);

        if (success) {
            await interaction.editReply({
                content: `✅ Notificação enviada com sucesso para amizade ${friendshipId}!`
            });
        } else {
            await interaction.editReply({
                content: `❌ Falha ao enviar notificação para amizade ${friendshipId}. Verifique se a amizade existe e é elegível.`
            });
        }

    } catch (error) {
        console.error('Error testing notification:', error);
        await interaction.editReply({
            content: '❌ Erro ao testar notificação.'
        });
    }
}

async function handleResetNotifications(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        await interaction.editReply({
            content: '⚠️ **ATENÇÃO**: Esta ação irá resetar TODAS as notificações de amizade!\n\nDeseja continuar? Resposta automática em 10 segundos...'
        });

        // Aguardar 10 segundos antes de executar
        setTimeout(async () => {
            try {
                await friendshipNotificationService.resetNotifications();
                await interaction.editReply({
                    content: '✅ Todas as notificações foram resetadas!'
                });
            } catch (error) {
                await interaction.editReply({
                    content: '❌ Erro ao resetar notificações.'
                });
            }
        }, 10000);

    } catch (error) {
        console.error('Error resetting notifications:', error);
        await interaction.editReply({
            content: '❌ Erro ao resetar notificações.'
        });
    }
}

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
    
    // ⭐ PARAR SERVIÇOS ANTES DE FECHAR
    if (friendshipNotificationService) {
        friendshipNotificationService.stop();
    }
    
    client.destroy();
    process.exit(0);
});

// Login with error handling
client.login(config.token).catch(error => {
    console.error('Failed to login:', error);
    console.log('Please check your bot token in config.json');
    process.exit(1);
});