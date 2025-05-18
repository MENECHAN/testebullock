const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Account = require('../models/Account');
const Friendship = require('../models/Friendship');
const CartService = require('../services/cartService');
const { validateRiotTag } = require('../utils/validators');
const PriceManagerHandler = require('./priceManagerHandler');

module.exports = {
    async handle(interaction) {
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

        // Handlers originais
        if (interaction.customId.startsWith('lol_nickname_modal_')) {
            await handleLolNicknameModal(interaction);
        } else if (interaction.customId.startsWith('search_modal_')) {
            await handleSearchModal(interaction);
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

async function handleSearchModal(interaction) {
    try {
        await interaction.deferUpdate();

        const cartId = interaction.customId.split('_')[2];
        const searchQuery = interaction.fields.getTextInputValue('search_query').toLowerCase();

        // Load catalog
        let catalog = [];
        try {
            catalog = require('../catalog.json');
        } catch (error) {
            console.error('Error loading catalog:', error);
            return await interaction.editReply({
                content: '❌ Erro ao carregar catálogo de skins.',
                components: []
            });
        }

        // Validate catalog
        if (!Array.isArray(catalog)) {
            console.error('Catalog is not an array');
            return await interaction.editReply({
                content: '❌ Catálogo inválido.',
                components: []
            });
        }
        
        // Filter skins based on search query with null checks
        const filteredSkins = catalog.filter(skin => {
            if (!skin || typeof skin !== 'object') return false;
            
            const name = skin.name || '';
            const champion = skin.champion || '';
            
            return name.toLowerCase().includes(searchQuery) ||
                   champion.toLowerCase().includes(searchQuery);
        });

        if (filteredSkins.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🔍 Nenhum Resultado')
                .setDescription(`Nenhuma skin encontrada para: **${searchQuery}**\n\n` +
                              'Tente pesquisar por:\n' +
                              '• Nome do campeão\n' +
                              '• Nome da skin\n' +
                              '• Palavras-chave')
                .setColor('#ed4245')
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`search_skins_${cartId}`)
                        .setLabel('🔍 Nova Pesquisa')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`back_cart_${cartId}`)
                        .setLabel('◀️ Voltar')
                        .setStyle(ButtonStyle.Secondary)
                );

            return await interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        }

        // Paginate results (max 25 per page)
        const itemsPerPage = 25;
        const totalPages = Math.ceil(filteredSkins.length / itemsPerPage);
        const currentPage = 1;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentSkins = filteredSkins.slice(startIndex, endIndex);

        // Validate each skin has required properties
        const validSkins = currentSkins.filter(skin => {
            return skin && 
                   skin.id !== undefined && 
                   skin.name && 
                   skin.champion && 
                   skin.price !== undefined;
        });

        if (validSkins.length === 0) {
            return await interaction.editReply({
                content: '❌ Erro: Skins inválidas encontradas no catálogo.',
                components: []
            });
        }

        // Create select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`skin_select_${cartId}_${currentPage}`)
            .setPlaceholder('Selecione uma skin')
            .addOptions(
                validSkins.map(skin => ({
                    label: skin.name.substring(0, 100), // Discord limit
                    description: `${skin.champion} - ${skin.price} RP (${(skin.price * 0.01).toFixed(2)}€)`.substring(0, 100),
                    value: skin.id.toString()
                }))
            );

        const components = [new ActionRowBuilder().addComponents(selectMenu)];

        // Add navigation buttons if multiple pages
        if (totalPages > 1) {
            const navigationRow = new ActionRowBuilder();
            
            if (currentPage > 1) {
                navigationRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`prev_page_${cartId}_${currentPage - 1}`)
                        .setLabel('◀️ Anterior')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            navigationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`back_search_${cartId}`)
                    .setLabel('🔍 Nova Pesquisa')
                    .setStyle(ButtonStyle.Primary)
            );

            if (currentPage < totalPages) {
                navigationRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`next_page_${cartId}_${currentPage + 1}`)
                        .setLabel('Próxima ▶️')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            components.push(navigationRow);
        } else {
            components.push(
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`back_search_${cartId}`)
                            .setLabel('🔍 Nova Pesquisa')
                            .setStyle(ButtonStyle.Primary)
                    )
            );
        }

        const embed = new EmbedBuilder()
            .setTitle('🔍 Resultados da Pesquisa')
            .setDescription(`**Pesquisa:** ${searchQuery}\n` +
                          `**Resultados:** ${filteredSkins.length} skin(s) encontrada(s)\n` +
                          `**Página:** ${currentPage}/${totalPages}\n\n` +
                          'Selecione uma skin no menu abaixo:')
            .setColor('#5865f2')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    } catch (error) {
        console.error('Error handling search modal:', error);
        
        try {
            await interaction.editReply({
                content: '❌ Erro ao processar pesquisa.',
                components: []
            });
        } catch (editError) {
            console.error('Error editing reply:', editError);
            await interaction.followUp({
                content: '❌ Erro ao processar pesquisa.',
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