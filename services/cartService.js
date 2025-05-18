const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Cart = require('../models/Cart');
const config = require('../config.json');

class CartService {
    static async sendCartEmbed(channel, cart) {
        try {
            // Get cart items
            const items = await Cart.getItems(cart.id);
            
            // Calculate totals
            const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
            const totalPrice = totalRP * 0.01; // 1 RP = 0.01 EUR

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🛒 Seu Carrinho')
                .setColor('#5865f2')
                .setTimestamp();

            if (items.length === 0) {
                embed.setDescription('**Seu carrinho está vazio**\n\n' +
                                   'Clique em "Add Item" para adicionar skins ao seu carrinho.');
            } else {
                let itemsList = '';
                items.forEach((item, index) => {
                    itemsList += `**${index + 1}.** ${item.skin_name}\n` +
                               `💎 ${item.skin_price.toLocaleString()} RP - ${(item.skin_price * 0.01).toFixed(2)}€\n\n`;
                });

                embed.setDescription(itemsList);
                embed.addFields(
                    { 
                        name: '💎 Total RP', 
                        value: totalRP.toLocaleString(), 
                        inline: true 
                    },
                    { 
                        name: '💰 Total Preço', 
                        value: `${totalPrice.toFixed(2)}€`, 
                        inline: true 
                    },
                    { 
                        name: '📦 Itens', 
                        value: items.length.toString(), 
                        inline: true 
                    }
                );
            }

            // Create buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cart.id}`)
                        .setLabel('➕ Add Item')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`remove_item_${cart.id}`)
                        .setLabel('➖ Remove Item')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(items.length === 0)
                );

            // Add checkout button if cart has items
            if (items.length > 0) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`checkout_${cart.id}`)
                        .setLabel('💳 Checkout')
                        .setStyle(ButtonStyle.Success)
                );
            }

            // Update cart totals in database
            await Cart.updateTotals(cart.id, totalRP, totalPrice);

            // Send or edit message
            const messageData = {
                embeds: [embed],
                components: [row]
            };

            // Try to get the last message in channel
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            if (lastMessage && lastMessage.author.id === channel.client.user.id) {
                await lastMessage.edit(messageData);
            } else {
                await channel.send(messageData);
            }

        } catch (error) {
            console.error('Error sending cart embed:', error);
            throw error;
        }
    }

    static async sendCheckoutEmbed(channel, cart) {
        try {
            const items = await Cart.getItems(cart.id);
            const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
            const totalPrice = totalRP * 0.01;

            const embed = new EmbedBuilder()
                .setTitle('💳 Checkout - Finalizar Pedido')
                .setDescription('**Resumo do seu pedido:**\n\n')
                .setColor('#57f287')
                .setTimestamp();

            // Add items to embed
            let itemsList = '';
            items.forEach((item, index) => {
                itemsList += `${index + 1}. ${item.skin_name} - ${item.skin_price.toLocaleString()} RP\n`;
            });

            embed.addFields(
                { name: '🛍️ Itens', value: itemsList, inline: false },
                { name: '💎 Total RP', value: totalRP.toLocaleString(), inline: true },
                { name: '💰 Total', value: `${totalPrice.toFixed(2)}€`, inline: true }
            );

            // Payment information
            const paymentInfo = this.getPaymentInfo();
            embed.addFields(paymentInfo);

            embed.setFooter({ 
                text: 'Após o pagamento, envie o comprovante neste canal',
                iconURL: channel.client.user.displayAvatarURL()
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`payment_sent_${cart.id}`)
                        .setLabel('✅ Pagamento Enviado')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`back_cart_${cart.id}`)
                        .setLabel('◀️ Voltar ao Carrinho')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error sending checkout embed:', error);
            throw error;
        }
    }

    static getPaymentInfo() {
        const fields = [];

        // PayPal
        if (config.paymentInfo.paypal) {
            fields.push({
                name: '💸 PayPal',
                value: `**Email:** ${config.paymentInfo.paypal.email}\n` +
                       `**Nota:** ${config.paymentInfo.paypal.notes}`,
                inline: false
            });
        }

        // Crypto
        if (config.paymentInfo.crypto) {
            let cryptoInfo = '';
            const crypto = config.paymentInfo.crypto;
            
            if (crypto.USDT_BEP20) cryptoInfo += `**USDT (BEP20):** ${crypto.USDT_BEP20}\n`;
            if (crypto.LTC) cryptoInfo += `**LTC:** ${crypto.LTC}\n`;
            if (crypto.ETH) cryptoInfo += `**ETH:** ${crypto.ETH}\n`;
            if (crypto.BTC) cryptoInfo += `**BTC:** ${crypto.BTC}\n`;
            
            if (crypto.notes) cryptoInfo += `\n*${crypto.notes}*`;

            if (cryptoInfo) {
                fields.push({
                    name: '🪙 Criptomoedas',
                    value: cryptoInfo,
                    inline: false
                });
            }
        }

        // Bank
        if (config.paymentInfo.bank) {
            fields.push({
                name: '🏦 Transferência Bancária',
                value: config.paymentInfo.bank.instructions,
                inline: false
            });
        }

        return fields;
    }

    static async handlePaymentSent(interaction, cartId) {
        try {
            await interaction.deferUpdate();

            // Mark cart as completed
            await Cart.updateStatus(cartId, 'completed');

            // Send to orders channel
            const ordersChannel = interaction.guild.channels.cache.get(config.encomendasChannelId);
            if (ordersChannel) {
                const cart = await Cart.findById(cartId);
                const items = await Cart.getItems(cartId);
                const user = await interaction.guild.members.fetch(cart.user_discord_id);

                const orderEmbed = new EmbedBuilder()
                    .setTitle('📝 Nova Encomenda')
                    .setDescription(`**Cliente:** ${user.user.tag} (${user.id})\n` +
                                  `**Canal:** ${interaction.channel}\n` +
                                  `**Total:** ${cart.total_price.toFixed(2)}€`)
                    .setColor('#faa61a')
                    .setTimestamp();

                let itemsList = '';
                items.forEach((item, index) => {
                    itemsList += `${index + 1}. ${item.skin_name}\n`;
                });

                orderEmbed.addFields({ name: 'Itens', value: itemsList });

                await ordersChannel.send({ embeds: [orderEmbed] });
            }

            // Update channel message
            const embed = new EmbedBuilder()
                .setTitle('✅ Pagamento Recebido')
                .setDescription('**Obrigado pela compra!**\n\n' +
                              'Seu pagamento foi registrado e sua encomenda está sendo processada.\n' +
                              'Você será notificado quando as skins forem entregues.')
                .setColor('#57f287')
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: []
            });

        } catch (error) {
            console.error('Error handling payment sent:', error);
            await interaction.followUp({
                content: '❌ Erro ao processar pagamento.',
                ephemeral: true
            });
        }
    }
}

module.exports = CartService;