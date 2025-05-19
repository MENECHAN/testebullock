const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Cart = require('../models/Cart');
const OrderLog = require('../models/OrderLog'); // ⭐ IMPORTAÇÃO NECESSÁRIA
const config = require('../config.json');
const fs = require('fs');

class CartService {

    static async sendCheckoutEmbed(interaction, client, cartId) {
        try {
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Starting with cartId: ${cartId}`);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Interaction state - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);

            // Só defer se ainda não foi respondido ou deferido
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply({ ephemeral: true });
            }

            // Buscar carrinho
            const cart = await Cart.findById(cartId);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Cart retrieval:`, cart ? `Status: ${cart.status}, User: ${cart.user_id}` : 'null');

            if (!cart) {
                const content = '❌ Carrinho não encontrado.';
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            // Aceitar tanto 'active' quanto 'pending_payment'
            const validStatuses = ['active', 'pending_payment'];
            if (!validStatuses.includes(cart.status)) {
                const content = `❌ Carrinho não pode ser usado para checkout. Status: ${cart.status}`;
                console.log(`[DEBUG CartService.sendCheckoutEmbed] ${content}`);
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            const items = await Cart.getItems(cartId);
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Items retrieved: ${items.length}`);

            if (items.length === 0) {
                const content = '❌ Seu carrinho está vazio.';
                return interaction.deferred ?
                    await interaction.editReply({ content }) :
                    await interaction.followUp({ content, ephemeral: true });
            }

            // Verificar se já existe um pedido ativo
            const existingOrder = await OrderLog.findByCartIdAndStatus(cartId, ['PENDING_PAYMENT_PROOF', 'PENDING_MANUAL_APPROVAL']);

            if (existingOrder) {
                console.log(`[DEBUG CartService.sendCheckoutEmbed] Existing order found: ${existingOrder.id}, status: ${existingOrder.status}`);

                let statusMessage = '';
                if (existingOrder.status === 'PENDING_PAYMENT_PROOF') {
                    statusMessage = '⏳ **Aguardando comprovante de pagamento**\n\nRealize o pagamento e envie o comprovante (imagem) neste canal.';
                } else if (existingOrder.status === 'PENDING_MANUAL_APPROVAL') {
                    statusMessage = '🔍 **Comprovante em análise**\n\nSeu comprovante foi recebido e está sendo analisado pela nossa equipe.';
                }

                const existingEmbed = new EmbedBuilder()
                    .setTitle('📋 Pedido Já Existe')
                    .setDescription(
                        `Você já tem um pedido ativo para este carrinho.\n\n` +
                        `**Pedido ID:** ${existingOrder.id}\n` +
                        `**Status:** ${statusMessage}\n\n` +
                        `**Total:** ${existingOrder.total_rp.toLocaleString()} RP (€${existingOrder.total_price.toFixed(2)})`
                    )
                    .setColor('#faa61a')
                    .setTimestamp();

                return interaction.deferred ?
                    await interaction.editReply({ embeds: [existingEmbed] }) :
                    await interaction.followUp({ embeds: [existingEmbed], ephemeral: true });
            }

            // Calcular totais
            const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
            const totalPriceEUR = totalRP * 0.01;
            console.log(`[DEBUG CartService.sendCheckoutEmbed] Totals calculated: ${totalRP} RP, €${totalPriceEUR}`);

            // Criar lista de itens
            const itemsList = items.map((item, index) =>
                `${index + 1}. ${item.skin_name} - ${item.skin_price.toLocaleString()} RP`
            ).join('\n');

            // Métodos de pagamento do config
            const paymentMethods = Object.entries(config.paymentMethods || {})
                .map(([method, details]) =>
                    `**${method.toUpperCase()}:**\n${details.instructions}\n*Taxa: ${details.feePercent || 0}%*`
                ).join('\n\n') || 'Nenhum método de pagamento configurado.';

            const embed = new EmbedBuilder()
                .setTitle('🛒 Checkout - Finalizar Pedido')
                .setDescription(
                    `Revise seu pedido antes de finalizar:\n\n` +
                    `**Itens (${items.length}):**\n${itemsList}\n\n` +
                    `**Total: ${totalRP.toLocaleString()} RP (€${totalPriceEUR.toFixed(2)})**`
                )
                .addFields([
                    {
                        name: '💳 Métodos de Pagamento',
                        value: paymentMethods.length > 1024 ? paymentMethods.substring(0, 1021) + '...' : paymentMethods,
                        inline: false
                    },
                    {
                        name: '📝 Próximos Passos',
                        value:
                            '1. Clique em "Confirmar Pedido"\n' +
                            '2. Realize o pagamento\n' +
                            '3. Envie o comprovante neste canal\n' +
                            '4. Aguarde aprovação',
                        inline: false
                    }
                ])
                .setColor('#00ff00')
                .setFooter({ text: `Carrinho ID: ${cartId}` })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_checkout_${cartId}`)
                        .setLabel('✅ Confirmar Pedido')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`back_cart_${cartId}`)
                        .setLabel('◀️ Voltar ao Carrinho')
                        .setStyle(ButtonStyle.Secondary)
                );

            console.log(`[DEBUG CartService.sendCheckoutEmbed] Sending checkout embed...`);

            // Responder baseado no estado da interação
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [embed],
                    components: [row],
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    embeds: [embed],
                    components: [row],
                    ephemeral: true
                });
            }

            console.log(`[DEBUG CartService.sendCheckoutEmbed] Checkout embed sent successfully`);

        } catch (error) {
            console.error('[ERROR CartService.sendCheckoutEmbed] Error:', error);
            console.error('[ERROR CartService.sendCheckoutEmbed] Stack:', error.stack);

            // Tentar responder com erro baseado no estado da interação
            const errorContent = '❌ Erro ao processar checkout. Tente novamente.';

            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: errorContent });
                } else if (!interaction.replied) {
                    await interaction.reply({ content: errorContent, ephemeral: true });
                } else {
                    await interaction.followUp({ content: errorContent, ephemeral: true });
                }
            } catch (followUpError) {
                console.error('[ERROR CartService.sendCheckoutEmbed] FollowUp error:', followUpError);
            }
        }
    }


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

                embed.setDescription(`Just click on search button to find your items.`);
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
                .addOptions(selectOptions.slice(0, 10)); // Discord limit

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

    // Em services/cartService.js, método sendItemsEmbed
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
                // ... código de nenhum item encontrado permanece igual
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

            // CORREÇÃO: Paginação apenas se mais de 10 itens
            const needsPagination = uniqueItems.length > 10;
            const itemsPerPage = needsPagination ? 10 : uniqueItems.length;
            const totalPages = needsPagination ? Math.ceil(uniqueItems.length / itemsPerPage) : 1;
            const startIndex = needsPagination ? (page - 1) * itemsPerPage : 0;
            const endIndex = needsPagination ? startIndex + itemsPerPage : uniqueItems.length;
            const currentItems = uniqueItems.slice(startIndex, endIndex);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle(`${this.getCategoryEmoji(category)} ${this.getCategoryName(category)}`)
                .setColor('#5865f2')
                .setTimestamp();

            // CORREÇÃO: Descrição condicional baseada na paginação
            if (needsPagination) {
                embed.setDescription(`**${uniqueItems.length} itens encontrados**\n` +
                    `Página ${page}/${totalPages}\n\n` +
                    'Selecione um item ou navegue entre as páginas:');
            } else {
                embed.setDescription(`**${uniqueItems.length} itens encontrados**\n\n` +
                    'Selecione um item:');
            }

            const components = [];

            // Create item select menu (limitado a 25 itens por limitação do Discord)
            if (currentItems.length > 0) {
                const itemsForSelect = currentItems.slice(0, 10); // Discord limit

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

                // Aviso se há mais itens que o limite do select menu
                if (currentItems.length > 10) {
                    embed.addFields([{
                        name: 'ℹ️ Nota',
                        value: `Mostrando os primeiros 25 itens desta página. Use os botões de navegação para ver mais.`,
                        inline: false
                    }]);
                }
            }

            // CORREÇÃO: Botões de navegação APENAS se precisar de paginação
            if (needsPagination && totalPages > 1) {
                const navButtons = [];

                // Botão "Página anterior"
                if (page > 1) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`items_page_${cartId}_${category}_${page - 1}`)
                            .setLabel('◀️ Anterior')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                // Botão de pesquisa (sempre presente)
                navButtons.push(
                    new ButtonBuilder()
                        .setCustomId(`search_category_${cartId}_${category}`)
                        .setLabel('🔍 Pesquisar')
                        .setStyle(ButtonStyle.Primary)
                );

                // Botão "Próxima página"
                if (page < totalPages) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`items_page_${cartId}_${category}_${page + 1}`)
                            .setLabel('Próxima ▶️')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                components.push(new ActionRowBuilder().addComponents(navButtons));
            } else {
                // Se não precisa de paginação, mostrar apenas botão de pesquisa
                const searchButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`search_category_${cartId}_${category}`)
                            .setLabel('🔍 Pesquisar')
                            .setStyle(ButtonStyle.Primary)
                    );
                components.push(searchButton);
            }

            // Botão de voltar às categorias (sempre presente)
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`add_item_${cartId}`)
                        .setLabel('🏷️ Voltar às Categorias')
                        .setStyle(ButtonStyle.Secondary)
                );
            components.push(backButton);

            // Send or edit message
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
            console.log(`[DEBUG] sendItemPreviewEmbed called with cartId: ${cartId}, itemId: ${itemId}`);

            // Load catalog
            let catalog = [];
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            // Find item
            const item = catalog.find(i => i.id == itemId);
            console.log(`[DEBUG] Item found for preview:`, item ? item.name : 'Not found');

            if (!item) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Item Não Encontrado')
                    .setDescription('O item selecionado não foi encontrado no catálogo.')
                    .setColor('#ed4245');

                return await channel.send({ embeds: [embed] });
            }

            // Determinar categoria
            let category = item.inventoryType || 'OTHER';
            if (item.subInventoryType === 'RECOLOR') {
                category = 'CHROMA';
            } else if (item.subInventoryType === 'CHROMA_BUNDLE') {
                category = 'CHROMA_BUNDLE';
            }

            // Create preview embed
            const embed = new EmbedBuilder()
                .setTitle('🎨 Preview do Item')
                .setDescription(`**${item.name}**\n\n` +
                    `${this.getCategoryEmoji(category)} **Categoria:** ${this.getCategoryName(category)}\n` +
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
            const customId = `confirm_add_${cartId}_${itemId}`;
            console.log(`[DEBUG] Creating button with customId: ${customId}`);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(customId)
                        .setLabel('✅ Adicionar ao Carrinho')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`back_items_${cartId}_${category}_1`)
                        .setLabel('◀️ Voltar')
                        .setStyle(ButtonStyle.Secondary)
                );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('[ERROR] Error sending item preview embed:', error);
            throw error;
        }
    }

    // Em services/cartService.js, método handleSearchInCategory
    // Em services/cartService.js, altere a assinatura do método:
    static async handleSearchInCategory(channel, cartId, category, searchQuery, page = 1) {
        try {
            console.log('handleSearchInCategory - category:', category, 'searchQuery:', searchQuery, 'page:', page);

            // Load catalog
            let catalog = [];

            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            }

            const query = searchQuery.toLowerCase();

            // Filter items by category and search query
            const allItems = catalog.filter(item => {
                let matchesCategory = false;

                if (category === 'CHROMA') {
                    matchesCategory = item.subInventoryType === 'RECOLOR';
                } else if (category === 'CHROMA_BUNDLE') {
                    matchesCategory = item.subInventoryType === 'CHROMA_BUNDLE';
                } else if (category === 'CHAMPION_SKIN') {
                    matchesCategory = item.inventoryType === 'CHAMPION_SKIN' &&
                        item.subInventoryType !== 'RECOLOR' &&
                        item.subInventoryType !== 'CHROMA_BUNDLE';
                } else {
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

            // CORREÇÃO: Implementar paginação se mais de 10 itens
            const needsPagination = uniqueItems.length > 10;
            const itemsPerPage = 10;
            const totalPages = needsPagination ? Math.ceil(uniqueItems.length / itemsPerPage) : 1;
            const startIndex = needsPagination ? (page - 1) * itemsPerPage : 0;
            const endIndex = needsPagination ? startIndex + itemsPerPage : uniqueItems.length;
            const currentPageItems = uniqueItems.slice(startIndex, endIndex);

            // Mostrar itens da página atual na lista
            let itemsList = '';
            currentPageItems.forEach((item, index) => {
                const globalIndex = startIndex + index + 1;
                itemsList += `**${globalIndex}.** ${item.name}\n`;
                itemsList += `💰 ${item.price.toLocaleString()} RP - ${(item.price * 0.01).toFixed(2)}€\n\n`;
            });

            if (needsPagination && page < totalPages) {
                const remainingItems = uniqueItems.length - endIndex;
                itemsList += `... e mais ${remainingItems} itens\n\n`;
                itemsList += `💡 *Use os botões de navegação para ver mais*`;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🔍 Resultados da Pesquisa na Categoria')
                .setColor('#5865f2')
                .setTimestamp();

            // CORREÇÃO: Descrição com informação de paginação
            if (needsPagination) {
                embed.setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n` +
                    `**Página:** ${page}/${totalPages}\n\n` +
                    (itemsList || 'Nenhum item encontrado'));
            } else {
                embed.setDescription(`**${uniqueItems.length} itens encontrados para:** ${searchQuery}\n` +
                    `**Categoria:** ${this.getCategoryName(category)}\n\n` +
                    (itemsList || 'Nenhum item encontrado'));
            }

            const components = [];

            // Create item select menu para os itens da página atual (limit to 25 items do Discord)
            if (currentPageItems.length > 0) {
                const selectOptions = currentPageItems.slice(0, 25).map(item => ({
                    label: item.name.length > 100 ? item.name.substring(0, 97) + '...' : item.name,
                    description: `${item.champion ? `${item.champion} - ` : ''}${item.price.toLocaleString()} RP (${(item.price * 0.01).toFixed(2)}€)`,
                    value: item.id.toString()
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`search_result_select_${cartId}`)
                    .setPlaceholder('Selecione uma skin...')
                    .addOptions(selectOptions);

                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            // CORREÇÃO: Botões de navegação com paginação
            // Em services/cartService.js, no método handleSearchInCategory, na parte dos botões:
            const navButtons = [];

            if (needsPagination && totalPages > 1) {
                // Botão "Página anterior"
                if (page > 1) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`search_result_page_${cartId}_${category}_${page - 1}_${encodeURIComponent(searchQuery)}`)
                            .setLabel('◀️ Anterior')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                // Botão "Próxima página"
                if (page < totalPages) {
                    navButtons.push(
                        new ButtonBuilder()
                            .setCustomId(`search_result_page_${cartId}_${category}_${page + 1}_${encodeURIComponent(searchQuery)}`)
                            .setLabel('Próxima ▶️')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
            }

            // Botões sempre presentes
            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`search_category_${cartId}_${category}`)
                    .setLabel('🔍 Nova Pesquisa')
                    .setStyle(ButtonStyle.Primary)
            );

            navButtons.push(
                new ButtonBuilder()
                    .setCustomId(`add_item_${cartId}`)
                    .setLabel('🏷️ Voltar ás categorias')
                    .setStyle(ButtonStyle.Secondary)
            );

            components.push(new ActionRowBuilder().addComponents(navButtons));

            // Editar mensagem existente ou enviar nova
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
    // Em services/cartService.js, corrigir o método validateItemAddition

    static async validateItemAddition(cartId, itemId) {
        try {
            // Verificar se o carrinho existe
            const cart = await Cart.findById(cartId);
            if (!cart) {
                return { valid: false, error: 'Carrinho não encontrado' };
            }

            // Carregar catálogo
            let catalog = [];
            if (fs.existsSync('./catalog.json')) {
                catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            } else {
                return { valid: false, error: 'Catálogo não encontrado' };
            }

            // Verificar se o item existe no catálogo
            const item = catalog.find(i => i.id == itemId);
            if (!item) {
                return { valid: false, error: 'Item não encontrado no catálogo' };
            }

            // Verificar se o item já está no carrinho
            const existingItem = await Cart.findItemInCart(cartId, itemId);
            if (existingItem) {
                return { valid: false, error: 'Este item já está no seu carrinho' };
            }

            // Verificar limites do carrinho
            const cartItems = await Cart.getItems(cartId);
            if (cartItems.length >= (config.orderSettings?.maxItemsPerOrder || 50)) {
                return { valid: false, error: `Limite máximo de ${config.orderSettings?.maxItemsPerOrder || 50} itens por carrinho` };
            }

            // Verificar valor total se existir limite
            if (config.orderSettings?.maxOrderValue) {
                const currentTotal = cartItems.reduce((sum, item) => sum + (item.skin_price * 0.01), 0);
                const newTotal = currentTotal + (item.price * 0.01);
                if (newTotal > config.orderSettings.maxOrderValue) {
                    return { valid: false, error: `Valor máximo por pedido excedido: €${newTotal.toFixed(2)} > €${config.orderSettings.maxOrderValue}` };
                }
            }

            return {
                valid: true,
                item: {
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    splashArt: item.splashArt || item.splash_art,
                    iconUrl: item.iconUrl,
                    category: item.inventoryType,
                    champion: item.champion
                }
            };

        } catch (error) {
            console.error('Error validating item addition:', error);
            return { valid: false, error: 'Erro interno ao validar item' };
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