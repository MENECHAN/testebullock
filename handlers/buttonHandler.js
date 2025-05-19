const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../config.json');
const User = require('../models/User');
const Account = require('../models/Account');
const Cart = require('../models/Cart');
const TicketService = require('../services/ticketService');
const CartService = require('../services/cartService');
const PriceManagerHandler = require('../handlers/priceManagerHandler');
const FriendshipService = require('../services/friendshipService');
const OrderService = require('../services/orderService');

module.exports = {
    async handle(interaction) {
        const [action, ...params] = interaction.customId.split('_');

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
                if (params[0] === 'close') {
                    await CartService.handleCloseCart(interaction, params[1]);
                } else if (params[0] === 'add') {
                    await handleConfirmAddItem(interaction, params[1], params[2]);
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
            case 'items':
                if (params[0] === 'page') {
                    await handleItemsPage(interaction, params[1], params[2], params[3]);
                }
                break;
            case 'search':
                if (params[0] === 'more') {
                    await handleSearchMore(interaction, params[1]);
                } else if (params[0] === 'category') {
                    // CORREÇÃO: Juntar todos os parâmetros depois do cartId
                    const cartId = params[1];
                    const category = params.slice(2).join('_'); // Isso vai juntar SUMMONER_ICON corretamente
                    console.log('buttonHandler search - cartId:', cartId, 'category:', category); // DEBUG
                    await handleCategorySearch(interaction, cartId, category);
                }
                break;
            case 'checkout':
                await handleCheckout(interaction, params[0]);
                break;
            case 'payment':
                if (params[0] === 'sent') {
                    await CartService.handlePaymentSent(interaction, params[1]);
                }
                break;
        }
    }
};

async function handleOpenCart(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Create or get user
        const user = await User.findOrCreate(interaction.user.id, interaction.user.username);

        // Check if user already has an active cart
        let cart = await Cart.findActiveByUserId(user.id);

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

        // Create new cart
        cart = await Cart.create(user.id, ticketChannel.id);

        // Send initial cart embed
        await CartService.sendCartEmbed(ticketChannel, cart);

        await interaction.editReply({
            content: `✅ Carrinho criado! Acesse ${ticketChannel}`
        });
    } catch (error) {
        console.error('Error opening cart:', error);

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

        await tempChannel.send({
            embeds: [embed],
            components: rows
        });

        // Auto-delete channel after 10 minutes
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
        await interaction.deferUpdate();

        // Validate item addition
        const validation = await CartService.validateItemAddition(cartId, itemId);

        if (!validation.valid) {
            return await interaction.followUp({
                content: `❌ ${validation.error}`,
                ephemeral: true
            });
        }

        // Add item to cart
        await Cart.addItem(cartId, validation.item.name, validation.item.price, validation.item.splashArt || validation.item.iconUrl, validation.item.category);

        // Update cart totals
        await Cart.updateTotals(cartId);

        // Return to cart view
        const cart = await Cart.findById(cartId);
        await CartService.sendCartEmbed(interaction.channel, cart);

        await interaction.followUp({
            content: `✅ **${validation.item.name}** adicionado ao carrinho!`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error confirming add item:', error);
        await interaction.followUp({
            content: '❌ Erro ao adicionar item ao carrinho.',
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

async function handleCheckout(interaction, cartId) {
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
                content: '❌ Seu carrinho está vazio.',
                ephemeral: true
            });
        }

        // Send checkout embed
        await CartService.sendCheckoutEmbed(interaction.channel, cart);
    } catch (error) {
        console.error('Error handling checkout:', error);
        await interaction.followUp({
            content: '❌ Erro ao processar checkout.',
            ephemeral: true
        });
    }
}