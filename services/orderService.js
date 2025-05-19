const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const OrderLog = require('../models/OrderLog');
const Account = require('../models/Account');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const config = require('../config.json');

class OrderService {

    static async sendOrderToAdminApproval(client, orderId) {
        try {
            console.log(`[DEBUG OrderService] Starting sendOrderToAdminApproval for order ${orderId}`);

            const order = await OrderLog.findById(orderId);
            console.log(`[DEBUG OrderService] Order retrieved:`, order ? `Status: ${order.status}` : 'null');

            if (!order || order.status !== 'PENDING_MANUAL_APPROVAL') {
                console.log(`[DEBUG OrderService] Order ${orderId} not found or wrong status. Current status: ${order?.status}`);
                return;
            }

            // Buscar informações do usuário
            let userTag = order.user_id;
            try {
                const discordUser = await client.users.fetch(order.user_id);
                userTag = discordUser.tag;
                console.log(`[DEBUG OrderService] User found: ${userTag}`);
            } catch (userError) {
                console.error(`[ERROR OrderService] Error fetching user ${order.user_id}:`, userError);
            }

            // ⭐ CORREÇÃO: Processar dados dos itens corretamente
            let itemsDescription = 'Nenhum item encontrado';
            let itemCount = 0;

            console.log(`[DEBUG OrderService] Raw items_data:`, order.items_data);

            if (order.items_data) {
                let parsedItems;

                // Tentar fazer parse se for string
                if (typeof order.items_data === 'string') {
                    try {
                        parsedItems = JSON.parse(order.items_data);
                        console.log(`[DEBUG OrderService] Parsed items from string:`, parsedItems);
                    } catch (parseError) {
                        console.error(`[ERROR OrderService] Error parsing items_data:`, parseError);
                        parsedItems = [];
                    }
                } else {
                    parsedItems = order.items_data;
                    console.log(`[DEBUG OrderService] Items already parsed:`, parsedItems);
                }

                // Processar itens
                if (Array.isArray(parsedItems) && parsedItems.length > 0) {
                    itemCount = parsedItems.length;
                    itemsDescription = parsedItems
                        .map((item, index) => {
                            const name = item.name || item.skin_name || 'Item sem nome';
                            const price = item.price || item.skin_price || 0;
                            return `${index + 1}. **${name}**\n   💎 ${price.toLocaleString()} RP`;
                        })
                        .join('\n');

                    console.log(`[DEBUG OrderService] Processed ${itemCount} items`);
                }
            }

            // ⭐ CRIAR EMBED DETALHADO
            const approvalEmbed = new EmbedBuilder()
                .setTitle(`🧾 Comprovante para Aprovação`)
                .setDescription(`**Pedido ID:** ${order.id}\n**Status:** Aguardando aprovação manual`)
                .addFields([
                    {
                        name: '👤 Cliente',
                        value: `${userTag}\n\`${order.user_id}\``,
                        inline: true
                    },
                    {
                        name: '📍 Canal',
                        value: `<#${order.order_channel_id}>`,
                        inline: true
                    },
                    {
                        name: '🔢 Quantidade de Itens',
                        value: itemCount.toString(),
                        inline: true
                    },
                    {
                        name: '💎 Total RP',
                        value: order.total_rp ? order.total_rp.toLocaleString() : 'N/A',
                        inline: true
                    },
                    {
                        name: '💰 Total EUR',
                        value: order.total_price ? `€${order.total_price.toFixed(2)}` : 'N/A',
                        inline: true
                    },
                    {
                        name: '📅 Data do Pedido',
                        value: order.created_at ? `<t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:F>` : 'N/A',
                        inline: true
                    },
                    {
                        name: '📦 Itens do Pedido',
                        value: itemsDescription.length > 1024 ? itemsDescription.substring(0, 1021) + '...' : itemsDescription,
                        inline: false
                    }
                ])
                .setColor('#faa61a')
                .setTimestamp();

            // Adicionar comprovante
            if (order.payment_proof_url) {
                approvalEmbed.setImage(order.payment_proof_url);
                approvalEmbed.addFields([
                    { name: '📷 Comprovante', value: '[Imagem anexada acima ⬆️]', inline: false }
                ]);
                console.log(`[DEBUG OrderService] Payment proof attached: ${order.payment_proof_url}`);
            }

            // ⭐ CRIAR BOTÕES
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_order_${order.id}`)
                        .setLabel('✅ Aprovar Pagamento')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_order_${order.id}`)
                        .setLabel('❌ Rejeitar Pagamento')
                        .setStyle(ButtonStyle.Danger)
                );

            // Enviar para canal de admin
            const adminChannelId = config.adminLogChannelId || config.approvalNeededChannelId || config.orderApprovalChannelId;
            if (!adminChannelId) {
                console.error(`[ERROR OrderService] No admin channel configured`);
                return;
            }

            console.log(`[DEBUG OrderService] Sending to admin channel: ${adminChannelId}`);

            const adminChannel = await client.channels.fetch(adminChannelId);
            if (adminChannel && adminChannel.isTextBased()) {
                const sentMessage = await adminChannel.send({
                    content: `🔔 **Novo comprovante para análise** - Pedido #${order.id}`,
                    embeds: [approvalEmbed],
                    components: [row]
                });

                console.log(`[DEBUG OrderService] Admin notification sent successfully. Message ID: ${sentMessage.id}`);
            } else {
                console.error(`[ERROR OrderService] Admin channel not found or not text-based`);
            }

        } catch (error) {
            console.error('[ERROR OrderService] Error in sendOrderToAdminApproval:', error);
            console.error('[ERROR OrderService] Error stack:', error.stack);
        }
    }

    static async approveOrder(interaction, orderId) {
        try {
            console.log(`[DEBUG OrderService.approveOrder] Starting approval for order ${orderId}`);
            await interaction.deferUpdate();

            const order = await OrderLog.findById(orderId);
            if (!order) {
                return await interaction.followUp({
                    content: '❌ Pedido não encontrado.',
                    ephemeral: true
                });
            }

            if (order.status !== 'PENDING_MANUAL_APPROVAL') {
                return await interaction.followUp({
                    content: `❌ Este pedido não está aguardando aprovação. Status atual: ${order.status}`,
                    ephemeral: true
                });
            }

            // ⭐ BUSCAR CONTAS DO USUÁRIO
            console.log(`[DEBUG OrderService.approveOrder] Looking for user accounts for Discord ID: ${order.user_id}`);

            // Buscar usuário na tabela users pelo Discord ID
            const User = require('../models/User');
            const user = await User.findByDiscordId(order.user_id);
            console.log(`[DEBUG OrderService.approveOrder] User found:`, user ? `ID ${user.id}` : 'none');

            if (!user) {
                return await interaction.followUp({
                    content: '❌ Usuário não encontrado no sistema.',
                    ephemeral: true
                });
            }

            // Buscar amizades/contas do usuário
            const Friendship = require('../models/Friendship');
            const friendships = await Friendship.findByUserId(user.id);
            console.log(`[DEBUG OrderService.approveOrder] Found ${friendships.length} friendships`);

            if (friendships.length === 0) {
                return await interaction.followUp({
                    content: '❌ Este usuário não possui contas adicionadas ao sistema.',
                    ephemeral: true
                });
            }

            // ⭐ BUSCAR CONTAS COM RP SUFICIENTE
            const Account = require('../models/Account');
            const accountsWithBalance = [];

            for (const friendship of friendships) {
                const account = await Account.findById(friendship.account_id);
                console.log(`[DEBUG OrderService.approveOrder] Checking account ${account?.nickname}: ${account?.rp_amount} RP (need ${order.total_rp})`);

                if (account && account.rp_amount >= order.total_rp) {
                    accountsWithBalance.push({
                        ...account,
                        lol_nickname: friendship.lol_nickname,
                        lol_tag: friendship.lol_tag,
                        friendship_id: friendship.id
                    });
                }
            }

            console.log(`[DEBUG OrderService.approveOrder] Found ${accountsWithBalance.length} accounts with sufficient balance`);

            if (accountsWithBalance.length === 0) {
                // Atualizar status para erro
                await OrderLog.updateStatus(orderId, 'ERROR_INSUFFICIENT_BALANCE');

                return await interaction.followUp({
                    content: `❌ Nenhuma conta do usuário possui RP suficiente.\n**Necessário:** ${order.total_rp.toLocaleString()} RP\n\nVerifique as contas manualmente.`,
                    ephemeral: true
                });
            }

            // ⭐ ATUALIZAR STATUS PARA AGUARDANDO SELEÇÃO DE CONTA
            await OrderLog.updateStatus(orderId, 'AWAITING_ACCOUNT_SELECTION');

            // ⭐ CRIAR SELECT MENU COM CONTAS
            const selectOptions = accountsWithBalance.map(account => ({
                label: `${account.nickname} (${account.rp_amount.toLocaleString()} RP)`,
                description: `Nick LoL: ${account.lol_nickname}#${account.lol_tag}`,
                value: account.id.toString(),
                emoji: '🎮'
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_account_${orderId}`)
                .setPlaceholder('Selecione a conta para debitar RP...')
                .addOptions(selectOptions.slice(0, 25)); // Limite Discord

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // ⭐ CRIAR EMBED DE SELEÇÃO
            const selectionEmbed = new EmbedBuilder()
                .setTitle(`💰 Selecionar Conta para Débito`)
                .setDescription(
                    `✅ **Pagamento aprovado para o Pedido #${orderId}**\n\n` +
                    `**Cliente:** <@${order.user_id}>\n` +
                    `**Total a debitar:** ${order.total_rp.toLocaleString()} RP\n` +
                    `**Contas disponíveis:** ${accountsWithBalance.length}\n\n` +
                    `Selecione qual conta deve ter o RP debitado:`
                )
                .setColor('#00ff00')
                .setFooter({ text: `Admin: ${interaction.user.tag} | Pedido ID: ${orderId}` })
                .setTimestamp();

            // ⭐ EDITAR MENSAGEM ORIGINAL
            await interaction.editReply({
                content: `✅ **Aprovação em andamento...**`,
                embeds: [selectionEmbed],
                components: [row]
            });

            console.log(`[DEBUG OrderService.approveOrder] Account selection sent for order ${orderId}`);

        } catch (error) {
            console.error('[ERROR OrderService.approveOrder] Error:', error);
            console.error('[ERROR OrderService.approveOrder] Stack:', error.stack);

            try {
                await interaction.followUp({
                    content: `❌ Erro ao aprovar pedido: ${error.message}`,
                    ephemeral: true
                });
            } catch (followUpError) {
                console.error('[ERROR OrderService.approveOrder] FollowUp error:', followUpError);
            }
        }
    }

    static async rejectOrder(interaction, orderId) {
        try {
            await interaction.deferUpdate();

            const order = await OrderLog.findById(orderId);
            if (!order) {
                return await interaction.followUp({
                    content: '❌ Pedido não encontrado.',
                    ephemeral: true
                });
            }

            // Atualizar status
            await OrderLog.updateStatus(orderId, 'REJECTED');

            // Notificar no canal do pedido
            try {
                const orderChannel = await interaction.client.channels.fetch(order.order_channel_id);
                if (orderChannel) {
                    const rejectionEmbed = new EmbedBuilder()
                        .setTitle('❌ Pedido Rejeitado')
                        .setDescription(
                            `Seu pedido **#${orderId}** foi rejeitado.\n\n` +
                            `**Motivo:** Comprovante de pagamento não aprovado.\n\n` +
                            `Se você acredita que isso é um erro, ` +
                            `entre em contato com nossa equipe.`
                        )
                        .setColor('#ed4245')
                        .setTimestamp();

                    await orderChannel.send({
                        content: `<@${order.user_id}>`,
                        embeds: [rejectionEmbed]
                    });
                }
            } catch (error) {
                console.error('Error notifying user:', error);
            }

            // Atualizar embed original
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#ed4245')
                .setTitle('❌ Pedido Rejeitado')
                .addFields([
                    { name: '👤 Rejeitado por', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                ]);

            await interaction.editReply({
                embeds: [originalEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error rejecting order:', error);
            await interaction.followUp({
                content: '❌ Erro ao rejeitar pedido.',
                ephemeral: true
            });
        }
    }

    static async processAccountSelection(interaction, orderId, accountId) {
        try {
            console.log(`[DEBUG OrderService.processAccountSelection] Starting for order ${orderId}, account ${accountId}`);

            const order = await OrderLog.findById(orderId);
            const Account = require('../models/Account');
            const account = await Account.findById(accountId);

            console.log(`[DEBUG OrderService.processAccountSelection] Order status: ${order?.status}`);
            console.log(`[DEBUG OrderService.processAccountSelection] Account balance: ${account?.rp_amount}`);

            if (!order || !account) {
                return await interaction.followUp({
                    content: '❌ Pedido ou conta não encontrada.',
                    ephemeral: true
                });
            }

            if (order.status !== 'AWAITING_ACCOUNT_SELECTION') {
                return await interaction.followUp({
                    content: `❌ Este pedido não está aguardando seleção de conta. Status: ${order.status}`,
                    ephemeral: true
                });
            }

            if (account.rp_amount < order.total_rp) {
                return await interaction.followUp({
                    content: `❌ Conta selecionada não possui RP suficiente.\n**Saldo:** ${account.rp_amount.toLocaleString()} RP\n**Necessário:** ${order.total_rp.toLocaleString()} RP`,
                    ephemeral: true
                });
            }

            // ⭐ DEBITAR RP DA CONTA
            const newBalance = account.rp_amount - order.total_rp;
            console.log(`[DEBUG OrderService.processAccountSelection] Debiting RP: ${account.rp_amount} - ${order.total_rp} = ${newBalance}`);

            const updateResult = await Account.updateRP(accountId, newBalance);
            console.log(`[DEBUG OrderService.processAccountSelection] Account update result: ${updateResult}`);

            if (!updateResult) {
                console.error(`[ERROR OrderService.processAccountSelection] Failed to update account balance`);
                return await interaction.followUp({
                    content: '❌ Erro ao debitar RP da conta.',
                    ephemeral: true
                });
            }

            // ⭐ FINALIZAR PEDIDO
            const adminNotes = `RP debitado da conta "${account.nickname}" (ID: ${account.id}). Saldo anterior: ${account.rp_amount}, debitado: ${order.total_rp}, novo saldo: ${newBalance}`;

            await OrderLog.assignAdminAndAccount(
                orderId,
                interaction.user.id,
                accountId,
                'COMPLETED',
                adminNotes
            );

            console.log(`[DEBUG OrderService.processAccountSelection] Order marked as completed`);

            // ⭐ EMBED DE SUCESSO
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Pedido Processado com Sucesso!')
                .setDescription(
                    `**Pedido #${orderId}** foi finalizado com sucesso.\n\n` +
                    `**Conta utilizada:** ${account.nickname}\n` +
                    `**RP debitado:** ${order.total_rp.toLocaleString()}\n` +
                    `**Saldo anterior:** ${account.rp_amount.toLocaleString()}\n` +
                    `**Novo saldo:** ${newBalance.toLocaleString()}`
                )
                .addFields([
                    { name: '👤 Admin responsável', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🎮 Cliente', value: `<@${order.user_id}>`, inline: true },
                    { name: '📅 Processado em', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                ])
                .setColor('#00ff00')
                .setTimestamp();

            await interaction.editReply({
                content: `✅ **Processamento concluído!**`,
                embeds: [successEmbed],
                components: [] // Remove componentes
            });

            // ⭐ NOTIFICAR CLIENTE
            try {
                const orderChannel = await interaction.client.channels.fetch(order.order_channel_id);
                if (orderChannel && orderChannel.isTextBased()) {
                    // Processar itens para mostrar ao cliente
                    let itemsList = 'Itens não disponíveis';
                    if (order.items_data) {
                        let parsedItems;
                        if (typeof order.items_data === 'string') {
                            parsedItems = JSON.parse(order.items_data);
                        } else {
                            parsedItems = order.items_data;
                        }

                        if (Array.isArray(parsedItems)) {
                            itemsList = parsedItems
                                .map((item, index) => {
                                    const name = item.name || item.skin_name || 'Item';
                                    return `${index + 1}. **${name}**`;
                                })
                                .join('\n');
                        }
                    }

                    const clientEmbed = new EmbedBuilder()
                        .setTitle('🎉 Pedido Aprovado e Processado!')
                        .setDescription(
                            `Seu pedido **#${orderId}** foi aprovado e os itens foram enviados!\n\n` +
                            `**Conta de destino:** ${account.nickname}\n` +
                            `**Total processado:** ${order.total_rp.toLocaleString()} RP\n\n` +
                            `**Itens entregues:**\n${itemsList}\n\n` +
                            `✨ Obrigado por comprar conosco! Os itens já estão disponíveis na sua conta.`
                        )
                        .setColor('#00ff00')
                        .setFooter({ text: `Pedido ID: ${orderId}` })
                        .setTimestamp();

                    await orderChannel.send({
                        content: `<@${order.user_id}> 🎉 **Pedido aprovado!**`,
                        embeds: [clientEmbed]
                    });

                    console.log(`[DEBUG OrderService.processAccountSelection] Client notification sent`);
                }
            } catch (channelError) {
                console.error(`[ERROR OrderService.processAccountSelection] Error notifying client:`, channelError);
            }

            console.log(`[DEBUG OrderService.processAccountSelection] Process completed successfully`);

        } catch (error) {
            console.error('[ERROR OrderService.processAccountSelection] Error:', error);
            console.error('[ERROR OrderService.processAccountSelection] Stack:', error.stack);

            try {
                await interaction.followUp({
                    content: `❌ Erro ao processar seleção: ${error.message}`,
                    ephemeral: true
                });
            } catch (followUpError) {
                console.error('[ERROR OrderService.processAccountSelection] FollowUp error:', followUpError);
            }
        }
    }
}

module.exports = OrderService;