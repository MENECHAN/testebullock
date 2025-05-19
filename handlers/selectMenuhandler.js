const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CartService = require('../services/cartService');
const Cart = require('../models/Cart');

module.exports = {
    async handle(interaction) {
        try {
            if (interaction.customId.startsWith('category_select_')) {
                await handleCategorySelection(interaction);
            } else if (interaction.customId.startsWith('item_select_')) {
                await handleItemSelection(interaction);
            } else if (interaction.customId.startsWith('search_result_select_')) {
                await handleSearchResultSelection(interaction);
            } else if (interaction.customId.startsWith('remove_item_select_')) {
                await handleItemRemoval(interaction);
            }
        } catch (error) {
            console.error('Error in select menu handler:', error);
            await interaction.followUp({
                content: '❌ Erro ao processar seleção.',
                ephemeral: true
            });
        }
    }
};

async function handleCategorySelection(interaction) {
    try {
        await interaction.deferUpdate();

        const cartId = interaction.customId.split('_')[2];
        const selectedCategory = interaction.values[0];
        
        // Show items from selected category
        await CartService.sendItemsEmbed(interaction.channel, cartId, selectedCategory, 1);
    } catch (error) {
        console.error('Error handling category selection:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar categoria.',
            ephemeral: true
        });
    }
}

async function handleItemSelection(interaction) {
    try {
        await interaction.deferUpdate();

        const [, , cartId, category, page] = interaction.customId.split('_');
        const selectedItemId = interaction.values[0];
        
        // Show item preview
        await CartService.sendItemPreviewEmbed(interaction.channel, cartId, selectedItemId);
    } catch (error) {
        console.error('Error handling item selection:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar item.',
            ephemeral: true
        });
    }
}

async function handleSearchResultSelection(interaction) {
    try {
        await interaction.deferUpdate();

        const cartId = interaction.customId.split('_')[3];
        const selectedItemId = interaction.values[0];
        
        // Show item preview
        await CartService.sendItemPreviewEmbed(interaction.channel, cartId, selectedItemId);
    } catch (error) {
        console.error('Error handling search result selection:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar item.',
            ephemeral: true
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
            ephemeral: true
        });
    } catch (error) {
        console.error('Error removing item:', error);
        await interaction.followUp({
            content: '❌ Erro ao remover item.',
            ephemeral: true
        });
    }
}