const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../../config.json');
const fs = require('fs');

module.exports = {
    async execute(interaction) {
        // Check if user has admin role
        if (!interaction.member.roles.cache.has(config.adminRoleId)) {
            return await interaction.reply({
                content: '❌ Você não tem permissão para usar este comando.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'prices':
                await handlePricesMenu(interaction);
                break;
            case 'edit-item':
                await handleEditItemSearch(interaction);
                break;
            case 'reset-prices':
                await handleResetPrices(interaction);
                break;
            case 'export-config':
                await handleExportConfig(interaction);
                break;
            case 'import-config':
                await handleImportConfig(interaction);
                break;
        }
    }
};

async function handlePricesMenu(interaction) {
    try {
        // Carregar configuração atual
        let priceConfig = getDefaultPriceConfig();
        if (fs.existsSync('./price-config.json')) {
            priceConfig = JSON.parse(fs.readFileSync('./price-config.json', 'utf8'));
        }

        // Criar embed com preços atuais
        const embed = new EmbedBuilder()
            .setTitle('💰 Gerenciamento de Preços')
            .setDescription('Configure os preços por categoria e raridade')
            .setColor('#faa61a')
            .setTimestamp();

        // Adicionar campos com preços atuais
        const skinPrices = priceConfig.categories.CHAMPION_SKIN;
        embed.addFields([
            {
                name: '🎨 Skins por Raridade',
                value: Object.entries(skinPrices)
                    .map(([rarity, price]) => `**${rarity}:** ${price} RP`)
                    .join('\n'),
                inline: true
            },
            {
                name: '📦 Modificadores',
                value: Object.entries(priceConfig.modifiers)
                    .map(([type, mult]) => `**${type}:** x${mult}`)
                    .join('\n'),
                inline: true
            },
            {
                name: '🏷️ Categorias Especiais',
                value: `**Bundles:** x${priceConfig.categories.BUNDLES.multiplier}\n` +
                       `**Hextech:** x${priceConfig.categories.HEXTECH.multiplier}\n` +
                       `**Prestige:** ${priceConfig.categories.PRESTIGE.price} RP`,
                inline: true
            }
        ]);

        // Criar botões para cada categoria
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('edit_price_ultimate')
                    .setLabel(`Ultimate (${skinPrices.Ultimate} RP)`)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('edit_price_legendary')
                    .setLabel(`Legendary (${skinPrices.Legendary} RP)`)
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('edit_price_epic')
                    .setLabel(`Epic (${skinPrices.Epic} RP)`)
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('edit_price_rare')
                    .setLabel(`Rare (${skinPrices.Rare} RP)`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('edit_price_common')
                    .setLabel(`Common (${skinPrices.Common} RP)`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('edit_price_chroma')
                    .setLabel(`Chroma (${skinPrices.Chroma} RP)`)
                    .setStyle(ButtonStyle.Secondary)
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('edit_price_bundles')
                    .setLabel(`Bundles (x${priceConfig.categories.BUNDLES.multiplier})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('edit_price_hextech')
                    .setLabel(`Hextech (x${priceConfig.categories.HEXTECH.multiplier})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('edit_price_prestige')
                    .setLabel(`Prestige (${priceConfig.categories.PRESTIGE.price} RP)`)
                    .setStyle(ButtonStyle.Success)
            );

        const row4 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('edit_individual_item')
                    .setLabel('🔍 Editar Item Individual')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('reset_all_prices')
                    .setLabel('🔄 Resetar Padrão')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.reply({
            embeds: [embed],
            components: [row1, row2, row3, row4],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error showing prices menu:', error);
        await interaction.reply({
            content: '❌ Erro ao mostrar menu de preços.',
            ephemeral: true
        });
    }
}

async function handleEditItemSearch(interaction) {
    try {
        // Carregar catálogo
        if (!fs.existsSync('./catalog.json')) {
            return await interaction.reply({
                content: '❌ Catálogo não encontrado.',
                ephemeral: true
            });
        }

        const catalog = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
        
        if (catalog.length === 0) {
            return await interaction.reply({
                content: '❌ Catálogo vazio.',
                ephemeral: true
            });
        }

        // Criar embed de busca
        const embed = new EmbedBuilder()
            .setTitle('🔍 Buscar Item para Editar')
            .setDescription('Digite o nome do campeão ou da skin para buscar:')
            .setColor('#5865f2')
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('search_item_to_edit')
                    .setLabel('🔍 Buscar Item')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in edit item search:', error);
        await interaction.reply({
            content: '❌ Erro ao iniciar busca de item.',
            ephemeral: true
        });
    }
}

async function handleResetPrices(interaction) {
    try {
        const defaultConfig = getDefaultPriceConfig();
        fs.writeFileSync('./price-config.json', JSON.stringify(defaultConfig, null, 2));

        const embed = new EmbedBuilder()
            .setTitle('✅ Preços Resetados')
            .setDescription('Configuração de preços foi resetada para os valores padrão.')
            .setColor('#57f287')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error resetting prices:', error);
        await interaction.reply({
            content: '❌ Erro ao resetar preços.',
            ephemeral: true
        });
    }
}

async function handleExportConfig(interaction) {
    try {
        if (!fs.existsSync('./price-config.json')) {
            return await interaction.reply({
                content: '❌ Configuração de preços não encontrada.',
                ephemeral: true
            });
        }

        const config = fs.readFileSync('./price-config.json', 'utf8');
        const buffer = Buffer.from(config, 'utf8');

        await interaction.reply({
            content: '✅ Aqui está sua configuração de preços:',
            files: [{
                attachment: buffer,
                name: 'price-config-export.json'
            }],
            ephemeral: true
        });
    } catch (error) {
        console.error('Error exporting config:', error);
        await interaction.reply({
            content: '❌ Erro ao exportar configuração.',
            ephemeral: true
        });
    }
}

async function handleImportConfig(interaction) {
    // Criar modal para importar configuração
    const modal = new ModalBuilder()
        .setCustomId('import_config_modal')
        .setTitle('Importar Configuração de Preços');

    const configInput = new TextInputBuilder()
        .setCustomId('config_json')
        .setLabel('Cole aqui o JSON da configuração')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('{"categories": {...}}')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(configInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

// Funções utilitárias

function getDefaultPriceConfig() {
    return {
        categories: {
            CHAMPION_SKIN: {
                Ultimate: 3250,
                Legendary: 1820,
                Epic: 1350,
                Rare: 975,
                Common: 520,
                Chroma: 290,
                Prestige: 2000,
                Mythic: 10,
                Hextech: 2200
            },
            CHAMPION: {
                price: 790
            },
            BUNDLES: {
                multiplier: 0.85
            },
            HEXTECH: {
                multiplier: 1.2
            },
            PRESTIGE: {
                price: 2000
            },
            MYTHIC: {
                price: 10
            }
        },
        modifiers: {
            prestige: 1.5,
            mythic: 2.0,
            limited: 1.3,
            legacy: 1.1,
            chroma: 0.5
        }
    };
}

// Handlers para botões de preço
async function handlePriceEdit(interaction, category) {
    const modal = new ModalBuilder()
        .setCustomId(`price_edit_modal_${category}`)
        .setTitle(`Editar Preço - ${category}`);

    const priceInput = new TextInputBuilder()
        .setCustomId('new_price')
        .setLabel('Novo Preço (RP) ou Multiplicador')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 1820 ou 0.85')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(priceInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

module.exports.handlePriceEdit = handlePriceEdit;