const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
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
                                   'Clique em "Add Item" para adicionar items ao seu carrinho.');
            } else {
                let itemsList = '';
                items.forEach((item, index) => {
                    const emoji = this.getCategoryEmoji(item.category);
                    itemsList += `**${index + 1}.** ${emoji} ${item.skin_name}\n` +
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
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cart.id}`)
                        .setLabel('➕ Add Item')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`remove_item_${cart.id}`)
                        .setLabel('➖ Remove Item')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(items.length === 0),
                    new ButtonBuilder()
                        .setCustomId(`close_cart_${cart.id}`)
                        .setLabel('🔒 Close Cart')
                        .setStyle(ButtonStyle.Secondary)
                );

            const components = [row1];

            // Add checkout button if cart has items
            if (items.length > 0) {
                const row2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`checkout_${cart.id}`)
                            .setLabel('💳 Checkout')
                            .setStyle(ButtonStyle.Success)
                    );
                components.push(row2);
            }

            // Update cart totals in database
            await Cart.updateTotals(cart.id, totalRP, totalPrice);

            // Send or edit message
            const messageData = {
                embeds: [embed],
                components: components
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

    static async sendCategorySelectEmbed(channel, cartId) {
        try {
            // Load catalog to get available categories
            const fs = require('fs');
            let catalog = [];
            
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Get unique categories with counts
            const categoryStats = {};
            catalog.forEach(item => {
                const category = item.category || 'OTHER';
                categoryStats[category] = (categoryStats[category] || 0) + 1;
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🏷️ Selecione uma Categoria')
                .setDescription('**Escolha uma categoria para navegar pelos itens:**\n\n' +
                              'Use o menu dropdown abaixo para selecionar o tipo de item que deseja adicionar.')
                .setColor('#5865f2')
                .setTimestamp();

            // Add category statistics
            if (Object.keys(categoryStats).length > 0) {
                const statsText = Object.entries(categoryStats)
                    .sort(([,a], [,b]) => b - a)
                    .map(([category, count]) => `${this.getCategoryEmoji(category)} **${this.getCategoryName(category)}**: ${count} itens`)
                    .join('\n');
                
                embed.addFields([{
                    name: '📊 Itens Disponíveis',
                    value: statsText,
                    inline: false
                }]);
            }

            // Create category select menu
            const selectOptions = Object.entries(categoryStats)
                .sort(([,a], [,b]) => b - a)
                .map(([category, count]) => ({
                    label: this.getCategoryName(category),
                    description: `${count} itens disponíveis`,
                    value: category,
                    emoji: this.getCategoryEmojiObject(category)
                }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`category_select_${cartId}`)
                .setPlaceholder('Selecione uma categoria...')
                .addOptions(selectOptions.slice(0, 25)); // Discord limit

            const row1 = new ActionRowBuilder().addComponents(selectMenu);

            // Add back button
            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`back_cart_${cartId}`)
                        .setLabel('◀️ Voltar ao Carrinho')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({
                embeds: [embed],
                components: [row1, row2]
            });

        } catch (error) {
            console.error('Error sending category select embed:', error);
            throw error;
        }
    }

    static async sendItemsEmbed(channel, cartId, category, page = 1) {
        try {
            // Load catalog
            const fs = require('fs');
            let catalog = [];
            
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Filter items by category
            const filteredItems = catalog.filter(item => item.category === category);

            if (filteredItems.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Nenhum Item Encontrado')
                    .setDescription(`Não há itens disponíveis na categoria **${this.getCategoryName(category)}**.`)
                    .setColor('#ed4245')
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                return await channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }

            // Pagination
            const itemsPerPage = 25;
            const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const currentItems = filteredItems.slice(startIndex, endIndex);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${this.getCategoryEmoji(category)} ${this.getCategoryName(category)}`)
                .setDescription(`**${filteredItems.length} itens encontrados**\n` +
                              `Página ${page}/${totalPages}\n\n` +
                              'Selecione um item no menu abaixo:')
                .setColor('#5865f2')
                .setTimestamp();

            // Create item select menu
            const selectOptions = currentItems.map(item => ({
                label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                description: `${item.champion ? `${item.champion} - ` : ''}${item.price} RP`,
                value: item.id.toString()
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`item_select_${cartId}_${category}_${page}`)
                .setPlaceholder('Selecione um item...')
                .addOptions(selectOptions);

            const components = [new ActionRowBuilder().addComponents(selectMenu)];

            // Add navigation buttons
            const navButtons = [];

            if (page > 1) {
                navButtons.push(
                    new ButtonBuilder()
                        .setCustomId(`items_page_${cartId}_${category}_${page - 1}`)
                        .setLabel('◀️ Anterior')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`add_item_${cartId}`)
                    .setLabel('🏷️ Categorias')
                    .setStyle(ButtonStyle.Primary)
            );

            if (page < totalPages) {
                navButtons.push(
                    new ButtonBuilder()
                        .setCustomId(`items_page_${cartId}_${category}_${page + 1}`)
                        .setLabel('Próxima ▶️')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            if (navButtons.length > 0) {
                components.push(new ActionRowBuilder().addComponents(navButtons));
            }

            await channel.send({
                embeds: [embed],
                components: components
            });

        } catch (error) {
            console.error('Error sending items embed:', error);
            throw error;
        }
    }

    static async sendItemPreviewEmbed(channel, cartId, itemId) {
        try {
            // Load catalog
            const fs = require('fs');
            let catalog = [];
            
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Find item
            const item = catalog.find(i => i.id == itemId);
            
            if (!item) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Item Não Encontrado')
                    .setDescription('O item selecionado não foi encontrado no catálogo.')
                    .setColor('#ed4245');

                return await channel.send({ embeds: [embed] });
            }

            // Create preview embed
            const embed = new EmbedBuilder()
                .setTitle('🎨 Preview do Item')
                .setDescription(`**${item.name}**\n\n` +
                              `${this.getCategoryEmoji(item.category)} **Categoria:** ${this.getCategoryName(item.category)}\n` +
                              `${item.champion ? `🏆 **Campeão:** ${item.champion}\n` : ''}` +
                              `💎 **Preço:** ${item.price.toLocaleString()} RP\n` +
                              `💰 **Valor:** ${(item.price * 0.01).toFixed(2)}€\n` +
                              `${item.rarity ? `✨ **Raridade:** ${item.rarity}\n` : ''}`)
                .setColor('#5865f2')
                .setTimestamp();

            // Add image if available
            if (item.splashArt) {
                embed.setImage(item.splashArt);
            } else if (item.iconUrl) {
                embed.setThumbnail(item.iconUrl);
            }

            // Add tags if available
            if (item.tags && item.tags.length > 0) {
                embed.addFields([{
                    name: '🏷️ Tags',
                    value: item.tags.slice(0, 10).join(', '),
                    inline: false
                }]);
            }

            // Create action buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_add_${cartId}_${itemId}`)
                        .setLabel('✅ Adicionar ao Carrinho')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`back_items_${cartId}_${item.category}_1`)
                        .setLabel('◀️ Voltar')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error sending item preview embed:', error);
            throw error;
        }
    }

    // Helper methods para categorias
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

    static getCategoryEmojiObject(category) {
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
        const emoji = emojis[category] || '❓';
        return { name: emoji };
    }

    static getCategoryName(category) {
        const names = {
            'SKIN': 'Skins',
            'CHAMPION': 'Campeões',
            'CHROMA': 'Chromas',
            'BUNDLE': 'Bundles',
            'CHROMA_BUNDLE': 'Chroma Bundles',
            'WARD': 'Ward Skins',
            'ICON': 'Ícones',
            'EMOTE': 'Emotes',
            'OTHER': 'Outros'
        };
        return names[category] || category;
    } // Continuação do CartService.js

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
                const emoji = this.getCategoryEmoji(item.category);
                itemsList += `${index + 1}. ${emoji} ${item.skin_name} - ${item.skin_price.toLocaleString()} RP\n`;
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
                text: 'Após o pagamento, clique em "Pagamento Enviado"',
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

    static async sendCloseCartConfirmation(channel, cartId) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🔒 Fechar Carrinho')
                .setDescription('**Tem certeza que deseja fechar este carrinho?**\n\n' +
                              '⚠️ Todos os itens serão removidos e este canal será deletado.\n' +
                              'Esta ação não pode ser desfeita!')
                .setColor('#faa61a')
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_close_${cartId}`)
                        .setLabel('✅ Sim, Fechar')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`cancel_close_${cartId}`)
                        .setLabel('❌ Cancelar')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error sending close cart confirmation:', error);
            throw error;
        }
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
                
                // Get user from cart
                const User = require('../models/User');
                const user = await User.findById(cart.user_id);
                const discordUser = await interaction.guild.members.fetch(user.discord_id);

                const orderEmbed = new EmbedBuilder()
                    .setTitle('📝 Nova Encomenda')
                    .setDescription(`**Cliente:** ${discordUser.user.tag} (${discordUser.id})\n` +
                                  `**Canal:** ${interaction.channel}\n` +
                                  `**Total:** ${cart.total_price.toFixed(2)}€`)
                    .setColor('#faa61a')
                    .setTimestamp();

                let itemsList = '';
                items.forEach((item, index) => {
                    const emoji = this.getCategoryEmoji(item.category);
                    itemsList += `${index + 1}. ${emoji} ${item.skin_name}\n`;
                });

                orderEmbed.addFields({ name: 'Itens', value: itemsList });

                await ordersChannel.send({ embeds: [orderEmbed] });
            }

            // Update channel message
            const embed = new EmbedBuilder()
                .setTitle('✅ Pagamento Recebido')
                .setDescription('**Obrigado pela compra!**\n\n' +
                              'Seu pagamento foi registrado e sua encomenda está sendo processada.\n' +
                              'Você será notificado quando as skins forem entregues.\n\n' +
                              'Este canal será fechado automaticamente em 5 minutos.')
                .setColor('#57f287')
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: []
            });

            // Auto-close channel after 5 minutes
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.error('Error auto-closing channel:', error);
                }
            }, 300000); // 5 minutes

        } catch (error) {
            console.error('Error handling payment sent:', error);
            await interaction.followUp({
                content: '❌ Erro ao processar pagamento.',
                ephemeral: true
            });
        }
    }

    static async handleCloseCart(interaction, cartId) {
        try {
            await interaction.deferUpdate();

            // Delete cart
            await Cart.delete(cartId);

            // Send closing message
            const embed = new EmbedBuilder()
                .setTitle('🔒 Carrinho Fechado')
                .setDescription('Este carrinho foi fechado.\n' +
                              'O canal será deletado em 10 segundos.')
                .setColor('#ed4245')
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: []
            });

            // Delete channel after 10 seconds
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.error('Error deleting channel:', error);
                }
            }, 10000);

        } catch (error) {
            console.error('Error handling close cart:', error);
            await interaction.followUp({
                content: '❌ Erro ao fechar carrinho.',
                ephemeral: true
            });
        }
    }

    static async handleSearchItems(channel, cartId, searchQuery) {
        try {
            // Load catalog
            const fs = require('fs');
            let catalog = [];
            
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Filter items by search query
            const query = searchQuery.toLowerCase();
            const filteredItems = catalog.filter(item => {
                return item.name.toLowerCase().includes(query) ||
                       (item.champion && item.champion.toLowerCase().includes(query)) ||
                       (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)));
            });

            if (filteredItems.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Nenhum Resultado')
                    .setDescription(`Nenhum item encontrado para: **${searchQuery}**\n\n` +
                                  'Tente pesquisar por:\n' +
                                  '• Nome do item\n' +
                                  '• Nome do campeão\n' +
                                  '• Categoria ou raridade')
                    .setColor('#ed4245')
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`add_item_${cartId}`)
                            .setLabel('◀️ Voltar às Categorias')
                            .setStyle(ButtonStyle.Secondary)
                    );

                return await channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔍 Resultados da Pesquisa')
                .setDescription(`**${filteredItems.length} itens encontrados para:** ${searchQuery}\n\n` +
                              'Selecione um item no menu abaixo:')
                .setColor('#5865f2')
                .setTimestamp();

            // Create item select menu (limit to 25 items)
            const selectOptions = filteredItems.slice(0, 25).map(item => ({
                label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                description: `${item.category} - ${item.price} RP`,
                value: item.id.toString()
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`search_result_select_${cartId}`)
                .setPlaceholder('Selecione um item...')
                .addOptions(selectOptions);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cartId}`)
                        .setLabel('🏷️ Categorias')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`search_more_${cartId}`)
                        .setLabel('🔍 Nova Pesquisa')
                        .setStyle(ButtonStyle.Secondary)
                );

            if (filteredItems.length > 25) {
                embed.addFields([{
                    name: '⚠️ Muitos Resultados',
                    value: `Mostrando os primeiros 25 de ${filteredItems.length} resultados.\nTente ser mais específico na pesquisa.`,
                    inline: false
                }]);
            }

            await channel.send({
                embeds: [embed],
                components: [row1, row2]
            });

        } catch (error) {
            console.error('Error handling search items:', error);
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

        // Bank transfer
        if (config.paymentInfo.bank) {
            fields.push({
                name: '🏦 Transferência Bancária',
                value: config.paymentInfo.bank.instructions,
                inline: false
            });
        }

        return fields;
    }

    // Method to validate if item can be added to cart
    static async validateItemAddition(cartId, itemId) {
        try {
            // Check if item exists in catalog
            const fs = require('fs');
            const catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            const item = catalog.find(i => i.id == itemId);
            
            if (!item) {
                throw new Error('Item não encontrado no catálogo');
            }

            // Check if item is already in cart
            const cartItems = await Cart.getItems(cartId);
            const isInCart = cartItems.some(cartItem => cartItem.original_item_id == itemId);
            
            if (isInCart) {
                throw new Error('Este item já está no seu carrinho');
            }

            // Check cart limits (if any)
            if (cartItems.length >= config.orderSettings.maxItemsPerOrder) {
                throw new Error(`Limite máximo de ${config.orderSettings.maxItemsPerOrder} itens por carrinho`);
            }

            return { valid: true, item };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
}

module.exports = CartService;