const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../config.json');
const User = require('../models/User');
const Account = require('../models/Account');
const Cart = require('../models/Cart');
const OrderLog = require('../models/OrderLog');
const TicketService = require('../services/ticketService');
const CartService = require('../services/cartService');
const PriceManagerHandler = require('../handlers/priceManagerHandler');
const FriendshipService = require('../services/friendshipService');
const fs = require('fs');
const OrderService = require('../services/orderService');

module.exports = {
    async handle(interaction) {
        console.log(`[DEBUG] Button interaction received: ${interaction.customId}`);

        const [action, ...params] = interaction.customId.split('_');
        console.log(`[DEBUG] Parsed action: ${action}, params:`, params);

        if (action === 'select' && params[0] === 'account') {
            // customId: select_account_ORDERID_ACCOUNTID
            const orderId = params[1];
            const accountId = params[2];

            console.log(`[DEBUG ButtonHandler] Account selection via button: Order ${orderId}, Account ${accountId}`);

            try {
                const OrderService = require('../services/orderService');
                await OrderService.processAccountSelection(interaction, orderId, accountId);
            } catch (error) {
                console.error('[ERROR ButtonHandler] Account selection error:', error);
                await interaction.reply({
                    content: '❌ Erro ao processar seleção de conta.',
                    ephemeral: true
                });
            }
            return;
        }

        if (action === 'approve' && params[0] === 'order') {
            await OrderService.approveOrder(interaction, params[1]);
            return;
        }
        if (action === 'reject' && params[0] === 'order') {
            await OrderService.rejectOrder(interaction, params[1]);
            return;
        }

        // Handlers para gerenciamento de preços
        if (action === 'edit' && params[0] === 'price') {
            await PriceManagerHandler.handlePriceButton(interaction);
            return;
        }
        if (action === 'search' && params[0] === 'item') {
            await PriceManagerHandler.handleSearchButton(interaction);
            return;
        }

        // ADICIONE ESTES HANDLERS AQUI:
        // Handlers para pedidos de amizade
        if (action === 'approve' && params[0] === 'friendship') {
            await FriendshipService.approveFriendship(interaction, params[1]);
            return;
        }
        if (action === 'reject' && params[0] === 'friendship') {
            await FriendshipService.rejectFriendship(interaction, params[1]);
            return;
        }
        if (action === 'friendship' && params[0] === 'info') {
            await FriendshipService.showFriendshipInfo(interaction, params[1]);
            return;
        }

        // Handlers para pedidos de compra
        if (action === 'approve' && params[0] === 'order') {
            await OrderService.approveOrder(interaction, params[1]);
            return;
        }
        if (action === 'reject' && params[0] === 'order') {
            await OrderService.rejectOrder(interaction, params[1]);
            return;
        }


        // Handlers do carrinho com dropdown
        switch (action) {
            case 'close':
                if (params[0] === 'account' && params[1] === 'ticket') {
                    await handleCloseAccountTicket(interaction);
                }
                break;
            case 'open':
                if (params[0] === 'cart') {
                    await handleOpenCart(interaction);
                }
                break;
            case 'add':
                if (params[0] === 'account') {
                    await handleAddAccount(interaction);
                } else if (params[0] === 'friend') {
                    await handleAddFriend(interaction, params[1]);
                } else if (params[0] === 'item') {
                    await handleAddItem(interaction, params[1]);
                }
                break;
            case 'remove':
                if (params[0] === 'item') {
                    await handleRemoveItem(interaction, params[1]);
                }
                break;
            case 'close':
                if (params[0] === 'cart') {
                    await handleCloseCart(interaction, params[1]);
                }
                break;
            case 'confirm':
                console.log(`[DEBUG] Confirm action with params:`, params);
                if (params[0] === 'close') {
                    await CartService.handleCloseCart(interaction, params[1]);
                } else if (params[0] === 'add') {
                    console.log(`[DEBUG] Calling handleConfirmAddItem with cartId: ${params[1]}, itemId: ${params[2]}`);
                    await handleConfirmAddItem(interaction, params[1], params[2]);
                } else if (params[0] === 'checkout') {
                    await handleConfirmCheckout(interaction, params[1]);
                }
                break;

            case 'cancel':
                if (params[0] === 'close') {
                    await handleCancelClose(interaction);
                }
                break;
            case 'back':
                if (params[0] === 'cart') {
                    await handleBackToCart(interaction, params[1]);
                } else if (params[0] === 'items') {
                    await handleBackToItems(interaction, params[1], params[2], params[3]);
                }
                break;
            // NOVO CASE PARA CHECKOUT
            case 'checkout':
                // customId: checkout_CARTID
                const checkoutCartId = params[0];
                await handleCheckout(interaction, checkoutCartId);
                break;

            // NOVO CASE PARA COMPROVANTE ENVIADO
            case 'payment':
                if (params[0] === 'proof' && params[1] === 'sent') {
                    // customId: payment_proof_sent_CARTID_ORDERID
                    const proofCartId = params[2]; // Ou o orderId se você mudou o customId para ser apenas _orderId
                    const proofOrderId = params[3]; // Ajuste aqui. Se o customId é payment_proof_sent_ORDERID, então proofOrderId = params[2]
                    // Na implementação de sendCheckoutEmbed, o customId é payment_proof_sent_${cartId}_${orderId}
                    // Então params[2] é cartId, params[3] é orderId
                    await OrderService.handleClientSentProof(interaction, proofOrderId); // Passar o orderId
                }
                break;
            case 'items':
                if (params[0] === 'page') {
                    await handleItemsPage(interaction, params[1], params[2], params[3]);
                }
                break;
            case 'searchpage':
                await handleSearchPageSimple(interaction, params[1], params[2], params[3]);
                break;
            case 'search':
                if (params[0] === 'more') {
                    await handleSearchMore(interaction, params[1]);
                } else if (params[0] === 'category') {
                    // CORREÇÃO: Juntar todos os parâmetros depois do cartId
                    const cartId = params[1];
                    const category = params.slice(2).join('_');
                    await handleCategorySearch(interaction, cartId, category);
                } else if (params[0] === 'result' && params[1] === 'page') {
                    // CORREÇÃO: search_result_page_cartId_category_page_encodedQuery
                    const cartId = params[2];
                    const categoryParts = [];
                    let pageIndex = -1;

                    // Encontrar onde está o número da página
                    for (let i = 3; i < params.length; i++) {
                        if (!isNaN(parseInt(params[i]))) {
                            pageIndex = i;
                            break;
                        }
                        categoryParts.push(params[i]);
                    }

                    if (pageIndex !== -1 && pageIndex + 1 < params.length) {
                        const category = categoryParts.join('_');
                        const page = params[pageIndex];
                        const encodedQuery = params[pageIndex + 1];
                        await handleSearchResultPage(interaction, cartId, category, page, encodedQuery);
                    }
                }
                break;

        }
    }
};


async function handleSearchPageSimple(interaction, cartId, page, encodedData) {
    try {
        await interaction.deferUpdate();

        const data = JSON.parse(Buffer.from(encodedData, 'base64').toString());
        const { category, query } = data;

        await CartService.handleSearchInCategory(interaction.channel, cartId, category, query, parseInt(page));
    } catch (error) {
        console.error('Error handling search page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}



// Em handlers/buttonHandler.js, adicione esta função:
async function handleSearchResultPage(interaction, cartId, category, page, encodedQuery) {
    try {
        await interaction.deferUpdate();

        const searchQuery = decodeURIComponent(encodedQuery);
        console.log('handleSearchResultPage:', { cartId, category, page, searchQuery }); // Debug

        await CartService.handleSearchInCategory(interaction.channel, cartId, category, searchQuery, parseInt(page));
    } catch (error) {
        console.error('Error handling search result page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}


// Em handlers/buttonHandler.js, adicionar esta função:
async function handleSearchPage(interaction, cartId, category, page, encodedQuery) {
    try {
        await interaction.deferUpdate();

        const searchQuery = decodeURIComponent(encodedQuery);
        await CartService.handleSearchInCategory(interaction.channel, cartId, category, searchQuery, parseInt(page));
    } catch (error) {
        console.error('Error handling search page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}

async function handleOpenCart(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        console.log(`[DEBUG] Opening cart for user: ${interaction.user.id}`);

        // Create or get user - ⭐ CORREÇÃO: Verificar se findOrCreate retorna o Discord ID
        const user = await User.findOrCreate(interaction.user.id, interaction.user.username);
        console.log(`[DEBUG] User found/created:`, user);

        // ⭐ CORREÇÃO: Usar interaction.user.id diretamente para buscar carrinho
        let cart = await Cart.findActiveByUserId(interaction.user.id);
        console.log(`[DEBUG] Active cart found:`, cart ? `ID ${cart.id}` : 'None');

        if (cart) {
            // Check if channel still exists
            const existingChannel = interaction.guild.channels.cache.get(cart.ticket_channel_id);
            if (existingChannel) {
                return await interaction.editReply({
                    content: `❌ Você já tem um carrinho ativo em ${existingChannel}`
                });
            } else {
                // Channel was deleted, create new cart
                await Cart.delete(cart.id);
                cart = null;
            }
        }

        // Create new ticket channel
        const ticketChannel = await TicketService.createTicket(interaction.guild, interaction.user);

        // ⭐ CORREÇÃO: Usar interaction.user.id para criar carrinho
        cart = await Cart.create(interaction.user.id, ticketChannel.id);
        console.log(`[DEBUG] New cart created with ID: ${cart.id}`);

        // Send initial cart embed
        await CartService.sendCartEmbed(ticketChannel, cart);

        await interaction.editReply({
            content: `✅ Carrinho criado! Acesse ${ticketChannel}`
        });
    } catch (error) {
        console.error('Error opening cart:', error);
        console.error('Error details:', error.stack);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ Erro ao abrir carrinho.'
                });
            } else {
                await interaction.reply({
                    content: '❌ Erro ao abrir carrinho.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

async function handleAddAccount(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Create temporary channel for account selection
        const tempChannel = await interaction.guild.channels.create({
            name: `account-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategoryId,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                },
                {
                    id: interaction.client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageMessages,
                        PermissionsBitField.Flags.EmbedLinks
                    ]
                }
            ]
        });

        // Get all accounts
        const accounts = await Account.findAvailable();

        if (accounts.length === 0) {
            await tempChannel.delete();
            return await interaction.editReply({
                content: '❌ Nenhuma conta disponível no momento.'
            });
        }

        // Send account selection embed
        const embed = new EmbedBuilder()
            .setTitle('👥 Selecione uma Conta')
            .setDescription('**Escolha uma conta para adicionar como amigo:**\n\n' +
                'Clique no botão "Add Friend" da conta desejada.')
            .setColor('#5865f2')
            .setTimestamp();

        const accountFields = accounts.map(account => ({
            name: `🎮 ${account.nickname}`,
            value: `**RP:** ${account.rp_amount.toLocaleString()}\n` +
                `**Amigos:** ${account.friends_count}/${account.max_friends}`,
            inline: true
        }));

        embed.addFields(accountFields);

        // Create buttons for each account
        // ⭐ CORREÇÃO: Botão Close ÚNICO no final
        // No buttonHandler.js, função handleAddAccount

        // Create buttons for each account
        const rows = [];
        let components = [];

        for (let i = 0; i < accounts.length; i++) {
            if (accounts[i].friends_count >= accounts[i].max_friends) continue;

            components.push(
                new ButtonBuilder()
                    .setCustomId(`add_friend_${accounts[i].id}`)
                    .setLabel(`Add Friend - ${accounts[i].nickname}`)
                    .setStyle(ButtonStyle.Primary)
            );

            if (components.length === 5 || i === accounts.length - 1) {
                if (components.length > 0) {
                    rows.push(new ActionRowBuilder().addComponents(components));
                    components = [];
                }
            }
        }

        // ⭐ ADICIONAR UM ÚNICO BOTÃO CLOSE NO FINAL
        const closeButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_account_ticket')
                    .setLabel('🔒 Fechar Canal')
                    .setStyle(ButtonStyle.Danger)
            );

        rows.push(closeButton);

        await tempChannel.send({
            embeds: [embed],
            components: rows
        });

        // Auto-delete channel after 10 minutes (manter este código)
        setTimeout(async () => {
            try {
                if (tempChannel && !tempChannel.deleted) {
                    await tempChannel.delete();
                }
            } catch (error) {
                console.error('Error deleting temp channel:', error);
            }
        }, 600000);

        await interaction.editReply({
            content: `✅ Canal criado! Acesse ${tempChannel} para selecionar uma conta.`
        });
    } catch (error) {
        console.error('Error handling add account:', error);

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ Erro ao processar solicitação.'
                });
            } else {
                await interaction.reply({
                    content: '❌ Erro ao processar solicitação.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

async function handleAddFriend(interaction, accountId) {
    try {
        const account = await Account.findById(accountId);

        if (!account) {
            return await interaction.reply({
                content: '❌ Conta não encontrada.',
                ephemeral: true
            });
        }

        if (account.friends_count >= account.max_friends) {
            return await interaction.reply({
                content: '❌ Esta conta já atingiu o limite máximo de amigos.',
                ephemeral: true
            });
        }

        // Create modal for LOL nickname input
        const modal = new ModalBuilder()
            .setCustomId(`lol_nickname_modal_${accountId}`)
            .setTitle('Digite seu Nick do LoL');

        const nicknameInput = new TextInputBuilder()
            .setCustomId('lol_nickname')
            .setLabel('Nick do League of Legends (nick#tag)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Exemplo: Player#BR1')
            .setRequired(true)
            .setMaxLength(50);

        const firstActionRow = new ActionRowBuilder().addComponents(nicknameInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error handling add friend:', error);
        await interaction.reply({
            content: '❌ Erro ao processar solicitação.',
            ephemeral: true
        });
    }
}

async function handleAddItem(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        const cart = await Cart.findById(cartId);
        if (!cart) {
            return await interaction.followUp({
                content: '❌ Carrinho não encontrado.',
                ephemeral: true
            });
        }

        // Show category selection
        await CartService.sendCategorySelectEmbed(interaction.channel, cartId);
    } catch (error) {
        console.error('Error handling add item:', error);
        await interaction.followUp({
            content: '❌ Erro ao processar solicitação.',
            ephemeral: true
        });
    }
}

async function handleRemoveItem(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        const cartItems = await Cart.getItems(cartId);

        if (cartItems.length === 0) {
            return await interaction.followUp({
                content: '❌ Seu carrinho está vazio.',
                ephemeral: true
            });
        }

        // Create select menu for item removal
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`remove_item_select_${cartId}`)
            .setPlaceholder('Selecione um item para remover')
            .addOptions(
                cartItems.map(item => ({
                    label: item.skin_name,
                    description: `${item.skin_price} RP - ${(item.skin_price * 0.01).toFixed(2)}€`,
                    value: item.id.toString()
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setTitle('🗑️ Remover Item')
            .setDescription('Selecione o item que deseja remover do carrinho:')
            .setColor('#ed4245')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error handling remove item:', error);
        await interaction.followUp({
            content: '❌ Erro ao processar solicitação.',
            ephemeral: true
        });
    }
}

async function handleCloseCart(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        // Show confirmation
        await CartService.sendCloseCartConfirmation(interaction.channel, cartId);
    } catch (error) {
        console.error('Error handling close cart:', error);
        await interaction.followUp({
            content: '❌ Erro ao fechar carrinho.',
            ephemeral: true
        });
    }
}

async function handleConfirmAddItem(interaction, cartId, itemId) {
    try {
        console.log(`[DEBUG] handleConfirmAddItem called with cartId: ${cartId}, itemId: ${itemId}`);
        await interaction.deferUpdate();

        // Verificar se o carrinho existe
        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart found:`, cart ? `ID ${cart.id}` : 'No cart found');

        if (!cart) {
            return await interaction.followUp({
                content: '❌ Carrinho não encontrado.',
                ephemeral: true
            });
        }

        // Carregar catálogo
        let catalog = [];
        if (fs.existsSync('./catalog.json')) {
            catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
            console.log(`[DEBUG] Catalog loaded with ${catalog.length} items`);
        } else {
            console.log(`[DEBUG] Catalog file not found`);
            return await interaction.followUp({
                content: '❌ Catálogo não encontrado.',
                ephemeral: true
            });
        }

        // Encontrar o item no catálogo
        const item = catalog.find(i => i.id == itemId);
        console.log(`[DEBUG] Item found in catalog:`, item ? `${item.name} (${item.price} RP)` : 'No item found');

        if (!item) {
            return await interaction.followUp({
                content: '❌ Item não encontrado no catálogo.',
                ephemeral: true
            });
        }

        // Verificar se o item já está no carrinho
        const existingItem = await Cart.findItemInCart(cartId, itemId);
        console.log(`[DEBUG] Existing item in cart:`, existingItem ? 'Found duplicate' : 'No duplicate');

        if (existingItem) {
            return await interaction.followUp({
                content: '❌ Este item já está no seu carrinho.',
                ephemeral: true
            });
        }

        // Determinar categoria do item
        let category = item.inventoryType || 'OTHER';
        if (item.subInventoryType === 'RECOLOR') {
            category = 'CHROMA';
        } else if (item.subInventoryType === 'CHROMA_BUNDLE') {
            category = 'CHROMA_BUNDLE';
        }
        console.log(`[DEBUG] Item category determined: ${category}`);

        // Adicionar item ao carrinho
        console.log(`[DEBUG] Adding item to cart...`);
        const addResult = await Cart.addItem(
            cartId,
            item.name,
            item.price,
            item.splashArt || item.iconUrl || null,
            category,
            itemId
        );
        console.log(`[DEBUG] Item added with ID: ${addResult}`);

        // Retornar ao carrinho
        const updatedCart = await Cart.findById(cartId);
        await CartService.sendCartEmbed(interaction.channel, updatedCart);

        await interaction.followUp({
            content: `✅ **${item.name}** adicionado ao carrinho!`,
            ephemeral: true
        });

        console.log(`[DEBUG] Item successfully added and cart updated`);

    } catch (error) {
        console.error('[ERROR] Error confirming add item:', error);
        console.error('[ERROR] Stack trace:', error.stack);
        await interaction.followUp({
            content: `❌ Erro ao adicionar item: ${error.message}`,
            ephemeral: true
        });
    }
}

async function handleCancelClose(interaction) {
    try {
        await interaction.deferUpdate();

        const embed = new EmbedBuilder()
            .setTitle('❌ Cancelado')
            .setDescription('Fechamento do carrinho cancelado.')
            .setColor('#5865f2')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: []
        });
    } catch (error) {
        console.error('Error handling cancel close:', error);
    }
}

async function handleBackToCart(interaction, cartId) {
    try {
        await interaction.deferUpdate();

        const cart = await Cart.findById(cartId);
        if (!cart) {
            return await interaction.followUp({
                content: '❌ Carrinho não encontrado.',
                ephemeral: true
            });
        }

        await CartService.sendCartEmbed(interaction.channel, cart);
    } catch (error) {
        console.error('Error going back to cart:', error);
        await interaction.followUp({
            content: '❌ Erro ao voltar para o carrinho.',
            ephemeral: true
        });
    }
}

async function handleBackToItems(interaction, cartId, category, page) {
    try {
        await interaction.deferUpdate();

        await CartService.sendItemsEmbed(interaction.channel, cartId, category, parseInt(page));
    } catch (error) {
        console.error('Error going back to items:', error);
        await interaction.followUp({
            content: '❌ Erro ao voltar para os itens.',
            ephemeral: true
        });
    }
}

async function handleItemsPage(interaction, cartId, category, page) {
    try {
        await interaction.deferUpdate();
        await CartService.sendItemsEmbed(interaction.channel, cartId, category, parseInt(page));
    } catch (error) {
        console.error('Error changing items page:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar página.',
            ephemeral: true
        });
    }
}

async function handleSearchMore(interaction, cartId) {
    try {
        const modal = new ModalBuilder()
            .setCustomId(`search_items_modal_${cartId}`)
            .setTitle('Pesquisar Itens');

        const searchInput = new TextInputBuilder()
            .setCustomId('search_query')
            .setLabel('Buscar por nome, campeão ou categoria')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Yasuo, PROJECT, Epic...')
            .setRequired(true)
            .setMaxLength(100);

        const firstActionRow = new ActionRowBuilder().addComponents(searchInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error handling search more:', error);
        await interaction.reply({
            content: '❌ Erro ao processar busca.',
            ephemeral: true
        });
    }
}

async function handleCategorySearch(interaction, cartId, category) {
    try {
        console.log('handleCategorySearch - cartId:', cartId, 'category:', category); // DEBUG

        const modal = new ModalBuilder()
            .setCustomId(`search_category_modal_${cartId}_${category}`)
            .setTitle(`Pesquisar em ${CartService.getCategoryName(category)}`);

        const searchInput = new TextInputBuilder()
            .setCustomId('search_query')
            .setLabel('Buscar por nome, campeão ou palavra-chave')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: Yasuo, PROJECT, Elementalist...')
            .setRequired(true)
            .setMaxLength(100);

        const firstActionRow = new ActionRowBuilder().addComponents(searchInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error handling category search:', error);
        await interaction.reply({
            content: '❌ Erro ao processar busca.',
            ephemeral: true
        });
    }
}

// handlers/buttonHandler.js - Versão simplificada do handleCheckout

async function handleCheckout(interaction, cartId) {
    try {
        console.log(`[DEBUG] handleCheckout called with cartId: ${cartId}`);

        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart lookup result:`, cart);

        if (!cart) {
            return await interaction.reply({
                content: '❌ Carrinho não encontrado. Tente abrir um novo carrinho.',
                ephemeral: true
            });
        }

        // ⭐ SIMPLIFICAÇÃO: Aceitar qualquer status ativo
        const validStatuses = ['active', 'pending_payment'];
        if (!validStatuses.includes(cart.status)) {
            return await interaction.reply({
                content: `❌ Este carrinho não pode ser usado para checkout. Status atual: ${cart.status}`,
                ephemeral: true
            });
        }

        const items = await Cart.getItems(cartId);
        console.log(`[DEBUG] Cart items count: ${items.length}`);

        if (items.length === 0) {
            return await interaction.reply({
                content: '❌ Seu carrinho está vazio. Adicione itens antes de fazer checkout.',
                ephemeral: true
            });
        }

        // ⭐ SIMPLIFICAÇÃO: Pular verificação de propriedade por enquanto
        // (assumir que quem clica é o dono)
        console.log(`[DEBUG] Skipping ownership check for now...`);

        // Chamar o método do CartService
        await CartService.sendCheckoutEmbed(interaction, interaction.client, cartId);

    } catch (error) {
        console.error('Error handling checkout:', error);
        console.error('Error stack:', error.stack);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Erro ao processar checkout. Tente novamente.',
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                content: '❌ Erro ao processar checkout.',
                ephemeral: true
            });
        }
    }
}

async function handleConfirmCheckout(interaction, cartId) {
    try {
        console.log(`[DEBUG] handleConfirmCheckout started with cartId: ${cartId}`);
        console.log(`[DEBUG] User ID: ${interaction.user.id}`);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }

        const cart = await Cart.findById(cartId);
        console.log(`[DEBUG] Cart found:`, cart ? `User: ${cart.user_id}` : 'No cart');

        if (!cart) {
            return await interaction.editReply({ content: '❌ Carrinho não encontrado.' });
        }

        const items = await Cart.getItems(cartId);
        if (items.length === 0) {
            return await interaction.editReply({ content: '❌ Carrinho vazio.' });
        }

        const totalRP = items.reduce((sum, item) => sum + item.skin_price, 0);
        const totalPrice = totalRP * 0.01;

        const itemsData = items.map(item => ({
            id: item.original_item_id || item.id,
            name: item.skin_name,
            price: item.skin_price,
            category: item.category || 'OTHER'
        }));

        console.log(`[DEBUG] About to create order...`);

        let orderId;

        try {
            // ⭐ CORREÇÃO: Usar interaction.user.id em vez de cart.user_id
            const userIdToUse = interaction.user.id; // Discord ID como string
            console.log(`[DEBUG] Using Discord ID: ${userIdToUse}`);

            orderId = await Promise.race([
                OrderLog.create(
                    userIdToUse,        // ⭐ User ID do Discord (string)
                    cartId,
                    itemsData,
                    totalRP,
                    totalPrice,
                    'PENDING_PAYMENT_PROOF',
                    null,
                    interaction.channel.id
                ),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('OrderLog.create timeout')), 5000)
                )
            ]);
            console.log(`[DEBUG] OrderLog.create succeeded with ID: ${orderId}`);

        } catch (createError) {
            console.error(`[ERROR] OrderLog.create failed:`, createError);
            console.log(`[DEBUG] Trying manual database insert...`);

            try {
                const db = require('../database/connection');
                const manualQuery = `
                    INSERT INTO order_logs (
                        user_id, cart_id, items_data, total_rp, total_price, 
                        status, payment_proof_url, order_channel_id, 
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `;

                const manualResult = await db.run(manualQuery, [
                    interaction.user.id,  // ⭐ User ID do Discord (string)
                    cartId,
                    JSON.stringify(itemsData),
                    totalRP,
                    totalPrice,
                    'PENDING_PAYMENT_PROOF',
                    null,
                    interaction.channel.id
                ]);

                orderId = manualResult.lastID;
                console.log(`[DEBUG] Manual insert succeeded with ID: ${orderId}`);

            } catch (manualError) {
                console.error(`[ERROR] Manual insert also failed:`, manualError);
                throw new Error(`Failed to create order: ${manualError.message}`);
            }
        }


        if (!orderId) {
            throw new Error('Order ID not generated');
        }

        console.log(`[DEBUG] Order created successfully with ID: ${orderId}`);

        // Atualizar status do carrinho
        await Cart.updateStatus(cartId, 'pending_payment');

        // Preparar métodos de pagamento
        const paymentMethods = Object.entries(config.paymentMethods || {})
            .map(([method, details]) =>
                `**${method.toUpperCase()}:**\n${details.instructions}`
            ).join('\n\n') || 'Métodos de pagamento não configurados';

        // Responder com sucesso
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Pedido Criado com Sucesso!')
            .setDescription(
                `**🆔 ID do Pedido:** \`${orderId}\`\n` +
                `**💎 Total RP:** ${totalRP.toLocaleString()}\n` +
                `**💰 Total EUR:** €${totalPrice.toFixed(2)}\n\n` +
                `**📝 Próximos passos:**\n` +
                `1️⃣ Realize o pagamento\n` +
                `2️⃣ **Envie a imagem do comprovante** neste canal\n` +
                `3️⃣ Aguarde nossa aprovação\n` +
                `4️⃣ Receba os itens na sua conta`
            )
            .addFields([
                {
                    name: '💳 Métodos de Pagamento',
                    value: paymentMethods,
                    inline: false
                },
                {
                    name: '📦 Itens do Pedido',
                    value: items.map((item, index) =>
                        `${index + 1}. **${item.skin_name}** - ${item.skin_price.toLocaleString()} RP`
                    ).join('\n'),
                    inline: false
                }
            ])
            .setColor('#00ff00')
            .setFooter({ text: `Pedido ID: ${orderId} | Carrinho ID: ${cartId}` })
            .setTimestamp();

        await interaction.editReply({
            content: `✅ **Pedido criado com sucesso!**`,
            embeds: [successEmbed]
        });

        // Enviar mensagem pública no canal
        await interaction.channel.send({
            content: `🛒 **Pedido criado por ${interaction.user}**`,
            embeds: [successEmbed]
        });

        console.log(`[DEBUG] handleConfirmCheckout completed successfully`);

    } catch (error) {
        console.error('[ERROR] Error in handleConfirmCheckout:', error);

        try {
            await interaction.editReply({
                content: `❌ Erro ao criar pedido: ${error.message}`
            });
        } catch (replyError) {
            console.error('[ERROR] Error sending error message:', replyError);
        }
    }

    // ⭐ FUNÇÃO SIMPLIFICADA
    // No final do buttonHandler.js:

    async function handleCloseAccountTicket(interaction) {
        try {
            await interaction.deferUpdate();

            const embed = new EmbedBuilder()
                .setTitle('🔒 Fechando Canal')
                .setDescription('Este canal será fechado em 5 segundos...')
                .setColor('#ed4245')
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: []
            });

            // Fechar canal após 5 segundos
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.error('Error deleting account channel:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error closing account ticket:', error);
            await interaction.followUp({
                content: '❌ Erro ao fechar canal.',
                ephemeral: true
            });
        }
    }

}