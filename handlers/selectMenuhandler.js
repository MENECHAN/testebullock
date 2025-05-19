// handlers/selectMenuHandler.js - Corrigir todos os ephemeral para flags

const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const CartService = require('../services/cartService');
const Cart = require('../models/Cart');

module.exports = {
    async handle(interaction) {
        try {
            console.log(`[DEBUG SelectMenu] Received interaction: ${interaction.customId}`);
            
            if (interaction.customId.startsWith('category_select_')) {
                await handleCategorySelection(interaction);
            } else if (interaction.customId.startsWith('item_select_')) {
                await handleItemSelection(interaction);
            } else if (interaction.customId.startsWith('search_result_select_')) {
                await handleSearchResultSelection(interaction);
            } else if (interaction.customId.startsWith('remove_item_select_')) {
                await handleItemRemoval(interaction);
            } else if (interaction.customId.startsWith('select_account_')) {
                console.log(`[DEBUG SelectMenu] Calling handleAccountSelection`);
                await handleAccountSelection(interaction);
            } else {
                console.log(`[DEBUG SelectMenu] Unknown select menu: ${interaction.customId}`);
            }
        } catch (error) {
            console.error('[ERROR SelectMenu] Error in main handler:', error);
            
            try {
                await interaction.followUp({
                    content: '❌ Erro ao processar seleção.',
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (followUpError) {
                console.error('[ERROR SelectMenu] FollowUp error:', followUpError);
            }
        }
    }
};

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
            flags: [MessageFlags.Ephemeral]
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
            flags: [MessageFlags.Ephemeral]
        });
    }
}

async function handleCategorySelection(interaction) {
    try {
        await interaction.deferUpdate();

        const cartId = interaction.customId.split('_')[2];
        const selectedCategory = interaction.values[0];
        
        console.log('handleCategorySelection - selectedCategory:', selectedCategory);
        
        // Show items from selected category
        await CartService.sendItemsEmbed(interaction.channel, cartId, selectedCategory, 1);
    } catch (error) {
        console.error('Error handling category selection:', error);
        await interaction.followUp({
            content: '❌ Erro ao carregar categoria.',
            flags: [MessageFlags.Ephemeral]
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
            flags: [MessageFlags.Ephemeral]
        });
    } catch (error) {
        console.error('Error removing item:', error);
        await interaction.followUp({
            content: '❌ Erro ao remover item.',
            flags: [MessageFlags.Ephemeral]
        });
    }
}

async function handleAccountSelection(interaction) {
    try {
        console.log(`[DEBUG SelectMenu] Account selection started`);
        await interaction.deferUpdate();

        const orderId = interaction.customId.split('_')[2];
        const selectedAccountId = interaction.values[0];
        
        console.log(`[DEBUG SelectMenu] Processing account selection: Order ${orderId}, Account ${selectedAccountId}`);
        
        const OrderService = require('../services/orderService');
        
        if (!OrderService.processAccountSelection) {
            console.error(`[ERROR SelectMenu] OrderService.processAccountSelection not found`);
            return await interaction.followUp({
                content: '❌ Método de processamento não encontrado.',
                flags: [MessageFlags.Ephemeral]
            });
        }
        
        await OrderService.processAccountSelection(interaction, orderId, selectedAccountId);
        console.log(`[DEBUG SelectMenu] Account selection completed`);
        
    } catch (error) {
        console.error('[ERROR SelectMenu] Error handling account selection:', error);
        console.error('[ERROR SelectMenu] Stack:', error.stack);
        
        try {
            await interaction.followUp({
                content: '❌ Erro ao processar seleção de conta.',
                flags: [MessageFlags.Ephemeral]
            });
        } catch (followUpError) {
            console.error('[ERROR SelectMenu] FollowUp error:', followUpError);
        }
    }
}