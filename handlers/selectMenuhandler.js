const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionFlagsBitField } = require('discord.js');
const CartService = require('../services/cartService');
const Cart = require('../models/Cart');

module.exports = {
    async handle(interaction) {
        if (interaction.customId.startsWith('skin_select_')) {
            await handleSkinSelection(interaction);
        } else if (interaction.customId.startsWith('remove_item_select_')) {
            await handleItemRemoval(interaction);
        }
    }
};

async function handleSkinSelection(interaction) {
    try {
        await interaction.deferUpdate();

        const [, , cartId, page] = interaction.customId.split('_');
        const skinId = interaction.values[0];
        
        // Get skin from catalog
        const catalog = require('../catalog.json');
        const skin = catalog.find(s => s.id == skinId);
        
        if (!skin) {
            return await interaction.followUp({
                content: '❌ Skin não encontrada.',
                flags: InteractionFlagsBitField.Flags.Ephemeral
            });
        }

        // Show skin preview
        const embed = new EmbedBuilder()
            .setTitle('🎨 Preview da Skin')
            .setDescription(`**${skin.name}**\n\n` +
                          `**Campeão:** ${skin.champion}\n` +
                          `**Raridade:** ${skin.rarity}\n` +
                          `**Preço:** ${skin.price} RP (${(skin.price * 0.01).toFixed(2)}€)`)
            .setColor('#5865f2')
            .setImage(skin.splash_art)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_skin_${cartId}_${skinId}`)
                    .setLabel('✅ Confirmar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`back_search_${cartId}`)
                    .setLabel('◀️ Voltar')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error handling skin selection:', error);
        await interaction.followUp({
            content: '❌ Erro ao processar seleção.',
            flags: InteractionFlagsBitField.Flags.Ephemeral
        });
    }
}

async function handleItemRemoval(interaction) {
    try {
        await interaction.deferUpdate();

        const cartId = interaction.customId.split('_')[3];
        const itemId = interaction.values[0];
        
        // Remove item from cart
        await Cart.removeItem(itemId);
        
        // Update cart totals
        await Cart.updateTotals(cartId);
        
        // Return to cart view
        const cart = await Cart.findById(cartId);
        await CartService.sendCartEmbed(interaction.channel, cart);
        
        await interaction.followUp({
            content: '✅ Item removido do carrinho!',
            flags: InteractionFlagsBitField.Flags.Ephemeral
        });
    } catch (error) {
        console.error('Error removing item:', error);
        await interaction.followUp({
            content: '❌ Erro ao remover item.',
            flags: InteractionFlagsBitField.Flags.Ephemeral
        });
    }
}