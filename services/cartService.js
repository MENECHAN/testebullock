const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Cart = require('../models/Cart');
const config = require('../config.json');
const fs = require('fs');

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

                embed.setDescription(`**${uniqueItems.length} itens encontrados**\n` +
                   `Página ${page}/${totalPages}\n\n` +
                   'Selecione um item ou pesquise por algo específico:');
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
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Filter only CHAMPION_SKIN items and get unique categories
            const skinItems = catalog;

            // Remove duplicates based on name
            const uniqueItems = [];
            const seenNames = new Set();

            skinItems.forEach(item => {
                // Para campeões, use o ID ao invés do nome para evitar duplicatas
                const identifier = item.inventoryType === 'CHAMPION' ? item.id : item.name;
                if (!seenNames.has(identifier)) {
                    seenNames.add(identifier);
                    uniqueItems.push(item);
                }
            });

            // Certifique-se de que esta parte está assim:
            const categoryStats = {};
            skinItems.forEach(item => {
                let category;

                // Se é chroma (RECOLOR), trate como categoria separada
                if (item.subInventoryType === 'RECOLOR') {
                    category = 'CHROMA';
                }
                // Se é bundle de chroma, trate como categoria separada
                else if (item.subInventoryType === 'CHROMA_BUNDLE') {
                    category = 'CHROMA_BUNDLE';
                }
                // Senão, use o inventoryType normal
                else {
                    category = item.inventoryType || 'OTHER';
                }

                categoryStats[category] = (categoryStats[category] || 0) + 1;
            });

            // Adicione este filtro para mostrar apenas categorias desejadas:
            const allowedCategories = [
                'CHAMPION_SKIN',
                'CHAMPION',
                'WARD_SKIN',
                'SUMMONER_ICON',
                'EMOTE',
                'BUNDLES',
                'COMPANION',
                'TFT_MAP_SKIN',
                'TFT_DAMAGE_SKIN',
                'HEXTECH_CRAFTING',
                'CHROMA',           // Adicione esta
                'CHROMA_BUNDLE'     // E esta
            ];

            // Filtra apenas as categorias permitidas
            const filteredCategoryStats = {};
            Object.entries(categoryStats).forEach(([category, count]) => {
                if (allowedCategories.includes(category)) {
                    filteredCategoryStats[category] = count;
                }
            });

            // Use filteredCategoryStats ao invés de categoryStats no resto da função

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🏷️ Selecione uma Categoria')
                .setDescription('**Escolha uma categoria para navegar pelos itens:**\n\n' +
                    'Use o menu dropdown abaixo para selecionar o tipo de item que deseja adicionar.')
                .setColor('#5865f2')
                .setTimestamp();

            // Add category statistics
            if (Object.keys(filteredCategoryStats).length > 0) {
                const statsText = Object.entries(filteredCategoryStats)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => `${this.getCategoryEmoji(category)} **${this.getCategoryName(category)}**: ${count} itens`)
                    .join('\n');

                embed.addFields([{
                    name: '📊 Itens disponíveis',
                    value: statsText,
                    inline: false
                }]);
            }

            // Create category select menu
            // Na função sendCategorySelectEmbed, verifique se esta parte está assim:
            const selectOptions = Object.entries(filteredCategoryStats)
                .sort(([, a], [, b]) => b - a)
                .map(([category, count]) => ({
                    label: this.getCategoryName(category),
                    description: `${count} itens disponíveis`,
                    value: category, // Deve ser exatamente a categoria (ex: CHAMPION_SKIN)
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
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Filter items by category and remove duplicates
            const allItems = catalog.filter(item => {
                if (category === 'CHROMA') {
                    return item.subInventoryType === 'RECOLOR';
                } else if (category === 'CHROMA_BUNDLE') {
                    return item.subInventoryType === 'CHROMA_BUNDLE';
                } else {
                    return item.inventoryType === category && item.subInventoryType !== 'RECOLOR' && item.subInventoryType !== 'CHROMA_BUNDLE';
                }
            });

            // Remove duplicates based on name
            const uniqueItems = [];
            const seenNames = new Set();

            allItems.forEach(item => {
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    uniqueItems.push(item);
                }
            });

            if (uniqueItems.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Nenhum Item Encontrado')
                    .setDescription(`Não há Itens disponíveis na categoria **${this.getCategoryName(category)}**.`)
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
            const totalPages = Math.ceil(uniqueItems.length / itemsPerPage);
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const currentItems = uniqueItems.slice(startIndex, endIndex);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${this.getCategoryEmoji(category)} ${this.getCategoryName(category)}`)
                .setDescription(`**${uniqueItems.length} itens encontrados**\n` +
                    `Página ${page}/${totalPages}\n\n` +
                    'Selecione um item ou pesquise por algo específico:')
                .setColor('#5865f2')
                .setTimestamp();

            const components = [];

            // Create item select menu if there are items
            if (currentItems.length > 0) {
                // Limitar para 25 itens no select menu (limite do Discord)
                const itemsForSelect = currentItems.slice(0, 25);

                const selectOptions = itemsForSelect.map(item => ({
                    label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                    description: `${item.champion ? `${item.champion} - ` : ''}${item.price.toLocaleString()} RP (${(item.price * 0.01).toFixed(2)}€)`,
                    value: item.id.toString()
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`item_select_${cartId}_${category}_${page}`)
                    .setPlaceholder('Selecione um item...')
                    .addOptions(selectOptions);
                components.push(new ActionRowBuilder().addComponents(selectMenu));

                // Se há mais itens que o limite, adicionar aviso
                if (currentItems.length > 25) {
                    embed.addFields([{
                        name: 'ℹ️ Nota',
                        value: `Mostrando os primeiros 25 itens desta página. Use os botões de navegação para ver mais itens.`,
                        inline: false
                    }]);
                }
            }

            // Add navigation and search buttons
            const navButtons = [];
            if (page > 1) {
                navButtons.push(
                    new ButtonBuilder()
                        .setCustomId(`items_page_${cartId}_${category}_${page - 1}`)
                        .setLabel('◀️ Anterior')
                        .setStyle(ButtonStyle.Secondary)
                );
                console.log('sendItemsEmbed - search button customId:', `search_category_${cartId}_${category}`);
            }

            // Add search button
            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`search_category_${cartId}_${category}`) // Aqui deve usar a categoria correta
                    .setLabel('🔍 Pesquisar')
                    .setStyle(ButtonStyle.Primary)
            );

            // Add categories button
            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`add_item_${cartId}`)
                    .setLabel('🏷️ Categorias')
                    .setStyle(ButtonStyle.Secondary)
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

            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            if (lastMessage && lastMessage.author.id === channel.client.user.id && lastMessage.embeds.length > 0) {
                await lastMessage.edit({
                    embeds: [embed],
                    components: components
                });
            } else {
                await channel.send({
                    embeds: [embed],
                    components: components
                });
            }

        } catch (error) {
            console.error('Error sending items embed:', error);
            throw error;
        }
    }

    static async sendItemPreviewEmbed(channel, cartId, itemId) {
        try {
            // Load catalog
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
                .setTitle('🎨 Preview da Skin')
                .setDescription(`**${item.name}**\n\n` +
                    `${this.getCategoryEmoji(item.category)} **Categoria:** ${this.getCategoryName(item.category)}\n` +
                    `${item.champion ? `🏆 **Campeão:** ${item.champion}\n` : ''}` +
                    `💎 **Preço:** ${item.price.toLocaleString()} RP\n` +
                    `💰 **Valor:** ${(item.price * 0.01).toFixed(2)}€\n` +
                    `${item.rarity ? `✨ **Raridade:** ${item.rarity}\n` : ''}`)
                .setColor('#5865f2')
                .setTimestamp();

            // Add image if available
            const imageUrl = item.splashArt || item.splash_art || item.iconUrl;
            if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                if (item.splashArt || item.splash_art) {
                    embed.setImage(imageUrl);
                } else {
                    embed.setThumbnail(imageUrl);
                }
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

    static async handleSearchInCategory(channel, cartId, category, searchQuery) {
        try {
            console.log('handleSearchInCategory - category:', category, 'searchQuery:', searchQuery); // DEBUG

            // Load catalog
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            const query = searchQuery.toLowerCase();

            // Filter items by category and search query
            // Filter items by category and search query
            const allItems = catalog.filter(item => {
                let matchesCategory = false;

                if (category === 'CHROMA') {
                    matchesCategory = item.subInventoryType === 'RECOLOR';
                } else if (category === 'CHROMA_BUNDLE') {
                    matchesCategory = item.subInventoryType === 'CHROMA_BUNDLE';
                } else if (category === 'CHAMPION_SKIN') {
                    // Para skins, filtrar por inventoryType e excluir chromas
                    matchesCategory = item.inventoryType === 'CHAMPION_SKIN' &&
                        item.subInventoryType !== 'RECOLOR' &&
                        item.subInventoryType !== 'CHROMA_BUNDLE';
                } else {
                    // Para outras categorias
                    matchesCategory = item.inventoryType === category;
                }

                const matchesSearch = item.name.toLowerCase().includes(query) ||
                    (item.champion && item.champion.toLowerCase().includes(query)) ||
                    (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)));

                return matchesCategory && matchesSearch;
            });
            // Remove duplicates based on name
            const uniqueItems = [];
            const seenNames = new Set();

            allItems.forEach(item => {
                if (!seenNames.has(item.name)) {
                    seenNames.add(item.name);
                    uniqueItems.push(item);
                }
            });

            if (uniqueItems.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Nenhum Resultado na Categoria')
                    .setDescription(`Nenhuma skin encontrada para: **${searchQuery}** na categoria **${this.getCategoryName(category)}**\n\n` +
                        'Tente:\n' +
                        '• Termos mais simples\n' +
                        '• Nome do campeão\n' +
                        '• Nome da skin')
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
            let itemsList = '';
            uniqueItems.slice(0, 10).forEach((item, index) => {
                itemsList += `**${index + 1}.** ${item.name}\n`;
                itemsList += `💰 ${item.price.toLocaleString()} RP - ${(item.price * 0.01).toFixed(2)}€\n`;
                itemsList += '\n';
            });

            if (uniqueItems.length > 10) {
                itemsList += `... e mais ${uniqueItems.length - 10} itens`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🔍 Resultados da Pesquisa na Categoria')
                .setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n\n` +
                    (itemsList || 'Nenhum item encontrado'))
                .setColor('#5865f2')
                .setTimestamp();

            // Create item select menu (limit to 25 items)
            const selectOptions = uniqueItems.slice(0, 25).map(item => ({
                label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                description: `${item.champion ? `${item.champion} - ` : ''}${item.price.toLocaleString()} RP (${(item.price * 0.01).toFixed(2)}€)`,
                value: item.id.toString()
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`search_result_select_${cartId}`)
                .setPlaceholder('Selecione uma skin...')
                .addOptions(selectOptions);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cartId}`)
                        .setLabel('🏷️ Categorias')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`search_category_${cartId}_${category}`)
                        .setLabel('🔍 Nova Pesquisa')
                        .setStyle(ButtonStyle.Secondary)
                );

            if (uniqueItems.length > 25) {
                embed.addFields([{
                    name: '⚠️ Muitos Resultados',
                    value: `Mostrando as primeiras 25 de ${uniqueItems.length} skins.\nTente ser mais específico na pesquisa.`,
                    inline: false
                }]);
            }

            await channel.send({
                embeds: [embed],
                components: [row1, row2]
            });

        } catch (error) {
            console.error('Error handling search in category:', error);
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
            'Epic': '⚡',
            'Legendary': '🌟',
            'Ultimate': '👑',
            'Rare': '💎',
            'Common': '🔸',
            'OTHER': '❓'
        };
        return emojis[category] || '🎨';
    }

    static getCategoryEmojiObject(category) {
        const emoji = this.getCategoryEmoji(category);
        return { name: emoji };
    }

    static getCategoryName(category) {
        const names = {
            'CHAMPION_SKIN': 'Skins de Campeão',
            'CHAMPION': 'Campeões',
            'WARD_SKIN': 'Skins de Ward',
            'SUMMONER_ICON': 'Ícones',
            'EMOTE': 'Emotes',
            'BUNDLES': 'Pacotes',
            'COMPANION': 'Companheiros',
            'TFT_MAP_SKIN': 'Skins de Mapa TFT',
            'TFT_DAMAGE_SKIN': 'Skins de Dano TFT',
            'HEXTECH_CRAFTING': 'Itens Hextech',
            'CHROMA': 'Chromas',
            'CHROMA_BUNDLE': 'Pacotes de Chroma',
            'OTHER': 'Outros'
        };
        return names[category] || category;
    }

    // Method to validate if item can be added to cart
    static async validateItemAddition(cartId, itemId) {
        try {
            // Check if item exists in catalog
            const catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            const item = catalog.find(i => i.id == itemId);

            if (!item) {
                throw new Error('Item não encontrado no catálogo');
            }

            // Check if item is already in cart
            const cartItems = await Cart.getItems(cartId);
            const isInCart = cartItems.some(cartItem => cartItem.original_item_id == itemId);

            if (isInCart) {
                throw new Error('Esta skin já está no seu carrinho');
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

    // Outros métodos permanecem os mesmos...
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
}

module.exports = CartService;