const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Account = require('../models/Account');
const Friendship = require('../models/Friendship');
const FriendshipLog = require('../models/FriendshipLog');
const config = require('../config.json');

class FriendshipService {
    static async requestFriendship(interaction, accountId, lolNickname, lolTag) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Obter usuário e conta
            const user = await User.findOrCreate(interaction.user.id, interaction.user.username);
            const account = await Account.findById(accountId);

            if (!account) {
                return await interaction.editReply({
                    content: '❌ Conta não encontrada.'
                });
            }

            // Verificar se já existe uma amizade
            const existingFriendship = await Friendship.findByUserAndAccount(user.id, accountId);
            if (existingFriendship) {
                return await interaction.editReply({
                    content: '❌ Você já é amigo desta conta.'
                });
            }

            // Verificar se já existe um pedido pendente
            const existingRequest = await FriendshipLog.findPendingRequest(user.id, accountId);
            if (existingRequest) {
                return await interaction.editReply({
                    content: '❌ Já existe um pedido de amizade pendente para esta conta.'
                });
            }

            // Criar log do pedido de amizade
            const requestId = await FriendshipLog.create(user.id, accountId, lolNickname, lolTag);

            // Enviar notificação para canal de administração
            await this.sendFriendshipRequestNotification(interaction.guild, user, account, lolNickname, lolTag, requestId);

            // Responder ao usuário
            await interaction.editReply({
                content: '✅ **Pedido de amizade enviado!**\n\n' +
                        `Sua solicitação para adicionar a conta **${account.nickname}** foi enviada para análise.\n` +
                        `**Seu nick:** ${lolNickname}#${lolTag}\n\n` +
                        'Você será notificado quando o pedido for processado.'
            });

            // Fechar canal temporário após 5 segundos
            setTimeout(async () => {
                try {
                    if (interaction.channel && interaction.channel.name.startsWith('account-')) {
                        await interaction.channel.delete();
                    }
                } catch (error) {
                    console.error('Error deleting temp channel:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error requesting friendship:', error);
            
            try {
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ Erro ao processar pedido de amizade.'
                    });
                } else {
                    await interaction.reply({
                        content: '❌ Erro ao processar pedido de amizade.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    }

    static async sendFriendshipRequestNotification(guild, user, account, lolNickname, lolTag, requestId) {
        try {
            // Canal de notificações de amizade (pode ser o approvalNeededChannelId ou criar um específico)
            const notificationChannel = guild.channels.cache.get(config.approvalNeededChannelId);
            
            if (!notificationChannel) {
                console.error('Canal de notificações não encontrado');
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('👥 Novo Pedido de Amizade')
                .setDescription('**Um usuário solicitou amizade com uma conta do sistema.**')
                .addFields([
                    { name: '👤 Usuário Discord', value: `${user.username} (<@${user.discord_id}>)`, inline: false },
                    { name: '🎮 Conta LoL', value: account.nickname, inline: true },
                    { name: '💎 RP Disponível', value: account.rp_amount.toLocaleString(), inline: true },
                    { name: '👥 Amigos', value: `${account.friends_count}/${account.max_friends}`, inline: true },
                    { name: '🏷️ Nick do Solicitante', value: `${lolNickname}#${lolTag}`, inline: false }
                ])
                .setColor('#faa61a')
                .setTimestamp()
                .setFooter({ text: `ID do Pedido: ${requestId}` });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_friendship_${requestId}`)
                        .setLabel('✅ Aprovar')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_friendship_${requestId}`)
                        .setLabel('❌ Rejeitar')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`friendship_info_${requestId}`)
                        .setLabel('ℹ️ Mais Info')
                        .setStyle(ButtonStyle.Secondary)
                );

            await notificationChannel.send({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error sending friendship request notification:', error);
        }
    }

    static async approveFriendship(interaction, requestId) {
        try {
            await interaction.deferUpdate();

            const request = await FriendshipLog.findById(requestId);
            if (!request) {
                return await interaction.followUp({
                    content: '❌ Pedido não encontrado.',
                    ephemeral: true
                });
            }

            if (request.status !== 'pending') {
                return await interaction.followUp({
                    content: '❌ Este pedido já foi processado.',
                    ephemeral: true
                });
            }

            // Verificar se a conta ainda tem espaço para amigos
            const account = await Account.findById(request.account_id);
            if (account.friends_count >= account.max_friends) {
                await FriendshipLog.updateStatus(requestId, 'rejected', interaction.user.id, 'Conta lotada');
                return await interaction.followUp({
                    content: '❌ A conta não tem mais espaço para novos amigos.',
                    ephemeral: true
                });
            }

            // Criar amizade
            await Friendship.create(request.user_id, request.account_id, request.lol_nickname, request.lol_tag);
            
            // Incrementar contador de amigos
            await Account.incrementFriendCount(request.account_id);

            // Atualizar status do pedido
            await FriendshipLog.updateStatus(requestId, 'approved', interaction.user.id, 'Aprovado por admin');

            // Notificar usuário
            const user = await User.findById(request.user_id);
            const discordUser = await interaction.guild.members.fetch(user.discord_id);
            
            try {
                await discordUser.send({
                    content: `✅ **Pedido de amizade aprovado!**\n\n` +
                            `Sua solicitação para a conta **${account.nickname}** foi aprovada.\n` +
                            `Nick cadastrado: **${request.lol_nickname}#${request.lol_tag}**\n\n` +
                            `Agora você pode fazer pedidos usando esta conta!`
                });
            } catch (dmError) {
                console.log('Não foi possível enviar DM para o usuário');
            }

            // Atualizar embed original
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#57f287')
                .setTitle('✅ Pedido de Amizade Aprovado')
                .addFields([
                    { name: '👤 Processado por', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Processado em', value: new Date().toLocaleString('pt-BR'), inline: true }
                ]);

            await interaction.editReply({
                embeds: [originalEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error approving friendship:', error);
            await interaction.followUp({
                content: '❌ Erro ao aprovar pedido.',
                ephemeral: true
            });
        }
    }

    static async rejectFriendship(interaction, requestId) {
        try {
            await interaction.deferUpdate();

            const request = await FriendshipLog.findById(requestId);
            if (!request) {
                return await interaction.followUp({
                    content: '❌ Pedido não encontrado.',
                    ephemeral: true
                });
            }

            if (request.status !== 'pending') {
                return await interaction.followUp({
                    content: '❌ Este pedido já foi processado.',
                    ephemeral: true
                });
            }

            // Atualizar status do pedido
            await FriendshipLog.updateStatus(requestId, 'rejected', interaction.user.id, 'Rejeitado por admin');

            // Notificar usuário
            const user = await User.findById(request.user_id);
            const account = await Account.findById(request.account_id);
            const discordUser = await interaction.guild.members.fetch(user.discord_id);
            
            try {
                await discordUser.send({
                    content: `❌ **Pedido de amizade rejeitado**\n\n` +
                            `Sua solicitação para a conta **${account.nickname}** foi rejeitada.\n` +
                            `Nick que foi enviado: **${request.lol_nickname}#${request.lol_tag}**\n\n` +
                            `Você pode tentar novamente ou entrar em contato com a administração.`
                });
            } catch (dmError) {
                console.log('Não foi possível enviar DM para o usuário');
            }

            // Atualizar embed original
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#ed4245')
                .setTitle('❌ Pedido de Amizade Rejeitado')
                .addFields([
                    { name: '👤 Processado por', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Processado em', value: new Date().toLocaleString('pt-BR'), inline: true }
                ]);

            await interaction.editReply({
                embeds: [originalEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error rejecting friendship:', error);
            await interaction.followUp({
                content: '❌ Erro ao rejeitar pedido.',
                ephemeral: true
            });
        }
    }

    static async showFriendshipInfo(interaction, requestId) {
        try {
            const request = await FriendshipLog.findById(requestId);
            if (!request) {
                return await interaction.reply({
                    content: '❌ Pedido não encontrado.',
                    ephemeral: true
                });
            }

            const user = await User.findById(request.user_id);
            const account = await Account.findById(request.account_id);

            // Verificar histórico do usuário
            const userHistory = await FriendshipLog.findByUserId(user.id);
            const approvedCount = userHistory.filter(r => r.status === 'approved').length;
            const rejectedCount = userHistory.filter(r => r.status === 'rejected').length;

            const embed = new EmbedBuilder()
                .setTitle('ℹ️ Informações do Pedido de Amizade')
                .addFields([
                    { name: '👤 Usuário', value: `${user.username} (<@${user.discord_id}>)`, inline: false },
                    { name: '🎮 Conta Solicitada', value: account.nickname, inline: true },
                    { name: '🏷️ Nick LoL', value: `${request.lol_nickname}#${request.lol_tag}`, inline: true },
                    { name: '📅 Data do Pedido', value: new Date(request.created_at).toLocaleString('pt-BR'), inline: true },
                    { name: '📊 Histórico do Usuário', value: `✅ Aprovados: ${approvedCount}\n❌ Rejeitados: ${rejectedCount}`, inline: false },
                    { name: '💎 RP da Conta', value: account.rp_amount.toLocaleString(), inline: true },
                    { name: '👥 Amigos Atuais', value: `${account.friends_count}/${account.max_friends}`, inline: true }
                ])
                .setColor('#5865f2')
                .setTimestamp()
                .setFooter({ text: `Status: ${request.status.toUpperCase()}` });

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error showing friendship info:', error);
            await interaction.reply({
                content: '❌ Erro ao buscar informações.',
                ephemeral: true
            });
        }
    }

    // Calcular tempo correto desde a adição
    static getTimeSince(dateString) {
        const now = new Date();
        const past = new Date(dateString);
        const diffInMinutes = Math.floor((now - past) / (1000 * 60));
        
        if (diffInMinutes < 0) {
            return 'há poucos instantes';
        } else if (diffInMinutes < 60) {
            return `há ${diffInMinutes} minuto(s)`;
        } else if (diffInMinutes < 1440) {
            const hours = Math.floor(diffInMinutes / 60);
            return `há ${hours} hora(s)`;
        } else {
            const days = Math.floor(diffInMinutes / 1440);
            return `há ${days} dia(s)`;
        }
    }
}

module.exports = FriendshipService;