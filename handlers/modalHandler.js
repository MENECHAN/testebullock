const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Account = require('../models/Account');
const Friendship = require('../models/Friendship');
const CartService = require('../services/cartService');
const { validateRiotTag } = require('../utils/validators');
const PriceManagerHandler = require('./priceManagerHandler');

module.exports = {
    async handle(interaction) {
        try {
            // Handlers para gerenciamento de preços
            if (interaction.customId.startsWith('price_edit_modal_')) {
                await PriceManagerHandler.handlePriceEditModal(interaction);
                return;
            }
            if (interaction.customId.startsWith('item_price_modal_')) {
                await PriceManagerHandler.handleItemPriceModal(interaction);
                return;
            }
            if (interaction.customId === 'search_item_modal') {
                await PriceManagerHandler.handleSearchModal(interaction);
                return;
            }
            if (interaction.customId === 'import_config_modal') {
                await PriceManagerHandler.handleImportConfigModal(interaction);
                return;
            }

            // Handlers do carrinho
            if (interaction.customId.startsWith('lol_nickname_modal_')) {
                await handleLolNicknameModal(interaction);
            } else if (interaction.customId.startsWith('search_items_modal_')) {
                await handleSearchItemsModal(interaction);
            }
        } catch (error) {
            console.error('Error in modal handler:', error);
            await interaction.followUp({
                content: '❌ Erro ao processar modal.',
                ephemeral: true
            });
        }
    }
};

async function handleLolNicknameModal(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const accountId = interaction.customId.split('_')[3];
        const lolNickname = interaction.fields.getTextInputValue('lol_nickname');

        // Validate riot tag format
        if (!validateRiotTag(lolNickname)) {
            return await interaction.editReply({
                content: '❌ Formato inválido! Use o formato: NickName#TAG (ex: Player#BR1)'
            });
        }

        const [nickname, tag] = lolNickname.split('#');

        // Get or create user
        const user = await User.findOrCreate(interaction.user.id, interaction.user.username);
        
        // Get account
        const account = await Account.findById(accountId);
        if (!account) {
            return await interaction.editReply({
                content: '❌ Conta não encontrada.'
            });
        }

        // Check if already friends
        const existingFriendship = await Friendship.findByUserAndAccount(user.id, accountId);
        if (existingFriendship) {
            return await interaction.editReply({
                content: '❌ Você já é amigo desta conta.'
            });
        }

        // Check account friend limit
        if (account.friends_count >= account.max_friends) {
            return await interaction.editReply({
                content: '❌ Esta conta já atingiu o limite máximo de amigos.'
            });
        }

        // Add friendship
        await Friendship.create(user.id, accountId, nickname, tag);
        
        // Update account friend count
        await Account.incrementFriendCount(accountId);

        // Show user's added accounts
        await showUserAccounts(interaction, user.id);

        // Delete temp channel after 5 seconds
        setTimeout(async () => {
            try {
                if (interaction.channel && interaction.channel.name.startsWith('account-')) {
                    await interaction.channel.delete();
                }
            } catch (error) {
                console.error('Error deleting channel:', error);
            }
        }, 5000);

    } catch (error) {
        console.error('Error handling LOL nickname modal:', error);
        
        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ Erro ao adicionar amizade.'
                });
            } else {
                await interaction.reply({
                    content: '❌ Erro ao adicionar amizade.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
}

async function handleSearchItemsModal(interaction) {
    try {
        await interaction.deferUpdate();

        const cartId = interaction.customId.split('_')[3];
        const searchQuery = interaction.fields.getTextInputValue('search_query');

        // Validate search query
        if (!searchQuery || searchQuery.trim().length < 2) {
            return await interaction.followUp({
                content: '❌ A busca deve ter pelo menos 2 caracteres.',
                ephemeral: true
            });
        }

        // Handle search
        await CartService.handleSearchItems(interaction.channel, cartId, searchQuery.trim());

    } catch (error) {
        console.error('Error handling search items modal:', error);
        
        try {
            await interaction.editReply({
                content: '❌ Erro ao processar busca.',
                components: []
            });
        } catch (editError) {
            console.error('Error editing reply:', editError);
            await interaction.followUp({
                content: '❌ Erro ao processar busca.',
                ephemeral: true
            });
        }
    }
}

async function showUserAccounts(interaction, userId) {
    try {
        const friendships = await Friendship.findByUserId(userId);
        
        if (friendships.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Amizade Adicionada')
                .setDescription('Amizade adicionada com sucesso!\n\nEsta é sua primeira conta adicionada.')
                .setColor('#57f287')
                .setTimestamp();

            return await interaction.editReply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle('✅ Amizade Adicionada')
            .setDescription('**Suas contas adicionadas:**\n\n')
            .setColor('#57f287')
            .setTimestamp();

        for (const friendship of friendships) {
            const account = await Account.findById(friendship.account_id);
            if (account) {
                const timeSince = getTimeSince(friendship.added_at);
                
                embed.addFields({
                    name: `🎮 ${account.nickname}`,
                    value: `**Seu Nick:** ${friendship.lol_nickname}#${friendship.lol_tag}\n` +
                           `**Adicionado:** ${timeSince} atrás`,
                    inline: true
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error showing user accounts:', error);
    }
}

function getTimeSince(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diffInMinutes = Math.floor((now - past) / (1000 * 60));
    
    if (diffInMinutes < 60) {
        return `${diffInMinutes} minuto(s)`;
    } else if (diffInMinutes < 1440) {
        const hours = Math.floor(diffInMinutes / 60);
        return `${hours} hora(s)`;
    } else {
        const days = Math.floor(diffInMinutes / 1440);
        return `${days} dia(s)`;
    }
}