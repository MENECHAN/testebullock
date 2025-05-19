const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Cart = require('../models/Cart');
const Account = require('../models/Account');
const Friendship = require('../models/Friendship');
const OrderLog = require('../models/OrderLog');
const config = require('../config.json');

class OrderService {
    static async processOrder(interaction, cartId) {
        try {
            await interaction.deferUpdate();

            const cart = await Cart.findById(cartId);
            if (!cart) {
                return await interaction.followUp({
                    content: '❌ Carrinho não encontrado.',
                    ephemeral: true
                });
            }

            const items = await Cart.getItems(cartId);
            if (items.length === 0) {
                return await interaction.followUp({
                    content: '❌ Carrinho vazio.',
                    ephemeral: true
                });
            }

            // Verificar se o usuário tem contas vinculadas
            const friendships = await Friendship.findByUserId(cart.user_id);
            if (friendships.length === 0) {
                return await interaction.followUp({
                    content: '❌ Você precisa ter pelo menos uma conta vinculada para finalizar a compra.',
                    ephemeral: true
                });
            }

            // Encontrar conta com RP suficiente
            const totalRP = cart.total_rp;
            const suitableAccount = await this.findSuitableAccount(friendships, totalRP);

            if (!suitableAccount) {
                return await interaction.followUp({
                    content: `❌ Nenhuma das suas contas possui RP suficiente (${totalRP.toLocaleString()} RP necessários).`,
                    ephemeral: true
                });
            }

            // Marcar carrinho como aguardando confirmação
            await Cart.updateStatus(cartId, 'pending_confirmation');

            // Criar log do pedido
            const orderLogId = await OrderLog.create(
                cartId, 
                cart.user_id, 
                suitableAccount.account_id, 
                'pending_approval',
                null,
                0,
                suitableAccount.rp_amount,
                suitableAccount.rp_amount
            );

            // Enviar para canal de aprovação
            await this.sendOrderApprovalRequest(interaction.guild, cart, items, suitableAccount, orderLogId);

            // Atualizar canal do carrinho
            const embed = new EmbedBuilder()
                .setTitle('⏳ Pedido Enviado para Aprovação')
                .setDescription('**Seu pedido foi enviado para análise!**\n\n' +
                              `**Conta selecionada:** ${suitableAccount.account_nickname}\n` +
                              `**RP disponível:** ${suitableAccount.rp_amount.toLocaleString()}\n` +
                              `**RP necessário:** ${totalRP.toLocaleString()}\n` +
                              `**Total:** ${cart.total_price.toFixed(2)}€\n\n` +
                              'Aguarde a confirmação de um administrador.')
                .setColor('#faa61a')
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: []
            });

        } catch (error) {
            console.error('Error processing order:', error);
            await interaction.followUp({
                content: '❌ Erro ao processar pedido.',
                ephemeral: true
            });
        }
    }

    static async findSuitableAccount(friendships, requiredRP) {
        try {
            for (const friendship of friendships) {
                const account = await Account.findById(friendship.account_id);
                if (account && account.rp_amount >= requiredRP) {
                    return {
                        account_id: account.id,
                        account_nickname: account.nickname,
                        rp_amount: account.rp_amount,
                        friendship_id: friendship.id
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('Error finding suitable account:', error);
            return null;
        }
    }

    static async sendOrderApprovalRequest(guild, cart, items, account, orderLogId) {
        try {
            const approvalChannel = guild.channels.cache.get(config.approvalNeededChannelId);
            if (!approvalChannel) {
                console.error('Canal de aprovação não encontrado');
                return;
            }

            // Buscar informações do usuário
            const User = require('../models/User');
            const user = await User.findById(cart.user_id);

            const embed = new EmbedBuilder()
                .setTitle('💳 Novo Pedido Aguardando Aprovação')
                .setDescription('**Um cliente finalizou uma compra e aguarda confirmação.**')
                .addFields([
                    { name: '👤 Cliente', value: `<@${user.discord_id}>\n${user.username}`, inline: true },
                    { name: '🎮 Conta Selecionada', value: account.account_nickname, inline: true },
                    { name: '💎 RP Disponível', value: account.rp_amount.toLocaleString(), inline: true },
                    { name: '💎 RP Necessário', value: cart.total_rp.toLocaleString(), inline: true },
                    { name: '💰 Valor Total', value: `${cart.total_price.toFixed(2)}€`, inline: true },
                    { name: '📦 Quantidade de Itens', value: items.length.toString(), inline: true }
                ])
                .setColor('#faa61a')
                .setTimestamp()
                .setFooter({ text: `Cart ID: ${cart.id} | Order Log: ${orderLogId}` });

            // Lista de itens
            let itemsList = '';
            items.forEach((item, index) => {
                const emoji = this.getCategoryEmoji(item.category);
                itemsList += `${index + 1}. ${emoji} ${item.skin_name} - ${item.skin_price.toLocaleString()} RP\n`;
                if (itemsList.length > 900) { // Limite do Discord
                    itemsList += '... e mais itens';
                    return;
                }
            });

            embed.addFields([{
                name: '🛍️ Itens do Pedido',
                value: itemsList || 'Nenhum item',
                inline: false
            }]);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_order_${orderLogId}`)
                        .setLabel('✅ Aprovar e Processar')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_order_${orderLogId}`)
                        .setLabel('❌ Rejeitar')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`order_details_${orderLogId}`)
                        .setLabel('ℹ️ Detalhes')
                        .setStyle(ButtonStyle.Secondary)
                );

            await approvalChannel.send({
                content: `<@&${config.adminRoleId}>`,
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error sending order approval request:', error);
        }
    }

    static async approveOrder(interaction, orderLogId) {
        try {
            await interaction.deferUpdate();

            const orderLog = await OrderLog.findById(orderLogId);
            if (!orderLog) {
                return await interaction.followUp({
                    content: '❌ Log do pedido não encontrado.',
                    ephemeral: true
                });
            }

            if (orderLog.action !== 'pending_approval') {
                return await interaction.followUp({
                    content: '❌ Este pedido já foi processado.',
                    ephemeral: true
                });
            }

            const cart = await Cart.findById(orderLog.cart_id);
            const account = await Account.findById(orderLog.account_id);

            if (!cart || !account) {
                return await interaction.followUp({
                    content: '❌ Dados do pedido não encontrados.',
                    ephemeral: true
                });
            }

            // Verificar se a conta ainda tem RP suficiente
            if (account.rp_amount < cart.total_rp) {
                await OrderLog.updateAction(orderLogId, 'rejected', interaction.user.id, 'RP insuficiente');
                return await interaction.followUp({
                    content: '❌ A conta não possui mais RP suficiente.',
                    ephemeral: true
                });
            }

            // Debitar RP da conta
            const newRpAmount = account.rp_amount - cart.total_rp;
            await Account.updateRP(account.id, newRpAmount);

            // Atualizar log do pedido
            await OrderLog.updateAction(
                orderLogId, 
                'approved', 
                interaction.user.id, 
                'Aprovado e RP debitado',
                cart.total_rp,
                account.rp_amount,
                newRpAmount
            );

            // Marcar carrinho como completado
            await Cart.updateStatus(cart.id, 'completed');

            // Notificar cliente
            const User = require('../models/User');
            const user = await User.findById(cart.user_id);
            const discordUser = await interaction.guild.members.fetch(user.discord_id);

            try {
                await discordUser.send({
                    content: `✅ **Pedido aprovado e processado!**\n\n` +
                            `Seu pedido foi aprovado e as skins estão sendo enviadas.\n` +
                            `**Conta utilizada:** ${account.nickname}\n` +
                            `**RP debitado:** ${cart.total_rp.toLocaleString()}\n` +
                            `**RP restante:** ${newRpAmount.toLocaleString()}\n\n` +
                            `As skins aparecerão na sua conta em breve!`
                });
            } catch (dmError) {
                console.log('Não foi possível enviar DM para o usuário');
            }

            // Enviar para canal de pedidos completados
            await this.sendCompletedOrderNotification(interaction.guild, cart, account, orderLog);

            // Atualizar embed original
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#57f287')
                .setTitle('✅ Pedido Aprovado e Processado')
                .addFields([
                    { name: '👤 Processado por', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Processado em', value: new Date().toLocaleString('pt-BR'), inline: true },
                    { name: '💎 RP Debitado', value: cart.total_rp.toLocaleString(), inline: true },
                    { name: '💎 RP Restante', value: newRpAmount.toLocaleString(), inline: true }
                ]);

            await interaction.editReply({
                embeds: [originalEmbed],
                components: []
            });

        } catch (error) {
            console.error('Error approving order:', error);
            await interaction.followUp({
                content: '❌ Erro ao aprovar pedido.',
                ephemeral: true
            });
        }
    }

    static async rejectOrder(interaction, orderLogId) {
        try {
            await interaction.deferUpdate();

            const orderLog = await OrderLog.findById(orderLogId);
            if (!orderLog) {
                return await interaction.followUp({
                    content: '❌ Log do pedido não encontrado.',
                    ephemeral: true
                });
            }

            if (orderLog.action !== 'pending_approval') {
                return await interaction.followUp({
                    content: '❌ Este pedido já foi processado.',
                    ephemeral: true
                });
            }

            // Atualizar log do pedido
            await OrderLog.updateAction(orderLogId, 'rejected', interaction.user.id, 'Rejeitado por admin');

            // Voltar status do carrinho para ativo
            await Cart.updateStatus(orderLog.cart_id, 'active');

            // Notificar cliente
            const User = require('../models/User');
            const user = await User.findById(orderLog.user_id);
            const cart = await Cart.findById(orderLog.cart_id);
            const discordUser = await interaction.guild.members.fetch(user.discord_id);

            try {
                await discordUser.send({
                    content: `❌ **Pedido rejeitado**\n\n` +
                            `Seu pedido foi rejeitado pela administração.\n` +
                            `**Valor:** ${cart.total_price.toFixed(2)}€\n\n` +
                            `Você pode modificar seu carrinho e tentar novamente, ou entrar em contato com o suporte.`
                });
            } catch (dmError) {
                console.log('Não foi possível enviar DM para o usuário');
            }

            // Atualizar embed original
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#ed4245')
                .setTitle('❌ Pedido Rejeitado')
                .addFields([
                    { name: '👤 Processado por', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Processado em', value: new Date().toLocaleString('pt-BR'), inline: true }
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

    static async sendCompletedOrderNotification(guild, cart, account, orderLog) {
        try {
            const completedChannel = guild.channels.cache.get(config.ordersCompletedChannelId);
            if (!completedChannel) return;

            const items = await Cart.getItems(cart.id);
            const User = require('../models/User');
            const user = await User.findById(cart.user_id);

            const embed = new EmbedBuilder()
                .setTitle('✅ Pedido Processado com Sucesso')
                .addFields([
                    { name: '👤 Cliente', value: `<@${user.discord_id}>`, inline: true },
                    { name: '🎮 Conta', value: account.nickname, inline: true },
                    { name: '💎 RP Debitado', value: cart.total_rp.toLocaleString(), inline: true },
                    { name: '💰 Valor', value: `${cart.total_price.toFixed(2)}€`, inline: true },
                    { name: '📦 Itens', value: items.length.toString(), inline: true },
                    { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true }
                ])
                .setColor('#57f287')
                .setTimestamp()
                .setFooter({ text: `Cart ID: ${cart.id}` });

            await completedChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending completed order notification:', error);
        }
    }

    static getCategoryEmoji(category) {
        const emojis = {
            'SKIN': '🎨',
            'CHAMPION': '🏆',
            'CHROMA': '🌈',
            'BUNDLE': '📦',
            'CHROMA_BUNDLE': '🎁',
            'WARD': '👁️',
            'ICON': '🖼️',
            'EMOTE': '😊',
            'OTHER': '❓'
        };
        return emojis[category] || '❓';
    }
}

module.exports = OrderService;