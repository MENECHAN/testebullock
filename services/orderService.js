// services/orderService.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const OrderLog = require('../models/OrderLog');
const Account = require('../models/Account');
// const User = require('../models/User'); // Descomente se você tem e usa para buscar info do usuário
const config = require('../config.json');

class OrderService {

    static async handleClientSentProof(interaction, orderId) {
        try {
            const order = await OrderLog.findById(orderId);
            if (!order) {
                return interaction.reply({ content: '❌ Pedido não encontrado.', ephemeral: true });
            }

            // Verifica se o comprovante já foi de fato registrado pelo listener de mensagens
            if (order.status !== 'PENDING_MANUAL_APPROVAL' && !order.payment_proof_url) {
                 await OrderLog.updateStatus(orderId, 'PENDING_PAYMENT_PROOF'); // Volta o status se necessário
                 return interaction.reply({ content: '⏳ Por favor, envie a imagem do comprovante neste canal primeiro e depois clique neste botão novamente.', ephemeral: true });
            }

            // Se chegou aqui, a print já foi processada e o status é PENDING_MANUAL_APPROVAL
            await interaction.reply({ content: '✅ Entendido! Seu comprovante foi recebido e será analisado pela nossa equipe. Você será notificado sobre o status.', ephemeral: true });
            // A notificação ao admin já foi feita pelo listener messageCreate ao detectar a imagem.

        } catch (error) {
            console.error("Error in handleClientSentProof:", error);
            await interaction.reply({ content: '❌ Ocorreu um erro ao processar sua confirmação.', ephemeral: true });
        }
    }

    static async sendOrderToAdminApproval(client, orderId) {
        try {
            const order = await OrderLog.findById(orderId);
            if (!order || order.status !== 'PENDING_MANUAL_APPROVAL') {
                console.log(`Pedido ${orderId} não encontrado ou status não é PENDING_MANUAL_APPROVAL (status atual: ${order.status}).`);
                return;
            }

            let userTag = order.user_id;
            let discordUser;
            try {
                discordUser = await client.users.fetch(order.user_id);
                userTag = discordUser.tag;
            } catch (fetchError) {
                console.error(`Não foi possível buscar o usuário ${order.user_id}:`, fetchError);
            }
            
            const itemsDescription = Array.isArray(order.items_data) ? order.items_data.map(item => `• ${item.name} (${item.price.toLocaleString()} RP)`).join('\n') : 'Itens não disponíveis';

            const approvalEmbed = new EmbedBuilder()
                .setTitle(`🧾 Novo Pedido para Aprovação - ID: ${order.id}`)
                .setColor('#f0ad4e')
                .addFields(
                    { name: '👤 Cliente', value: `${userTag} (\`${order.user_id}\`)`, inline: true },
                    { name: '🗨️ Canal do Pedido', value: `<#${order.order_channel_id}> (\`${order.order_channel_id}\`)`, inline: true },
                    { name: '💎 Total RP', value: order.total_rp.toLocaleString(), inline: true },
                    { name: '💶 Total EUR (aprox.)', value: `€${order.total_price ? order.total_price.toFixed(2) : 'N/A'}`, inline: true },
                    { name: '📦 Itens', value: itemsDescription || 'Nenhum item listado.', inline: false },
                    { name: '📅 Data do Pedido', value: order.created_at ? `<t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:F>` : 'N/A', inline: false }
                )
                .setFooter({ text: `Aguardando aprovação manual do pagamento. ID do Pedido: ${order.id}` })
                .setTimestamp();

            if (order.payment_proof_url) {
                approvalEmbed.setImage(order.payment_proof_url);
            } else {
                approvalEmbed.addFields({name: '⚠️ Comprovante', value: 'O comprovante ainda não foi enviado ou não foi detectado corretamente.'});
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_payment_${order.id}`)
                        .setLabel('✅ Aprovar Pagamento')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_payment_${order.id}`)
                        .setLabel('❌ Rejeitar Pagamento')
                        .setStyle(ButtonStyle.Danger)
                );

            const adminChannelId = config.orderApprovalChannelId || config.adminLogChannelId;
            if (!adminChannelId) {
                 console.error("ID do canal de aprovação/log de pedidos não configurado em config.json.");
                 return;
            }
            const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
            
            if (adminChannel && adminChannel.isTextBased()) {
                await adminChannel.send({ embeds: [approvalEmbed], components: [row] });
            } else {
                console.error(`Canal de aprovação de pedidos (${adminChannelId}) não encontrado ou não é um canal de texto.`);
            }

        } catch (error) {
            console.error('Error sending order to admin approval:', error);
        }
    }

    static async presentAccountSelectionForDebit(interaction, orderId) {
        try {
            await interaction.deferUpdate();

            const order = await OrderLog.findById(orderId);
            if (!order) {
                return interaction.editReply({ content: '❌ Pedido não encontrado.', embeds:[], components: [] });
            }
            if (order.status !== 'PENDING_MANUAL_APPROVAL' && order.status !== 'AWAITING_DEBIT_ACCOUNT_SELECTION') { // Status que permitem esta ação
                return interaction.editReply({
                    content: `⚠️ Este pedido não está aguardando seleção de conta para débito (Status atual: ${order.status}).`,
                    embeds: [], components: []
                });
            }

            const availableAccounts = await Account.findAvailableForDebit(order.total_rp);
            
            if (!availableAccounts || availableAccounts.length === 0) {
                await OrderLog.updateStatus(orderId, 'ERROR_NO_ACCOUNT_FOR_DEBIT'); // Novo status para indicar problema
                return interaction.editReply({
                    content: `⚠️ Pagamento Aprovado para o Pedido #${orderId}, mas NENHUMA conta de RP com saldo suficiente (${order.total_rp.toLocaleString()} RP) foi encontrada para o débito. Verifique as contas manualmente.`,
                    embeds: [], components: []
                });
            }
            
            await OrderLog.updateStatus(orderId, 'AWAITING_DEBIT_ACCOUNT_SELECTION');

            const selectOptions = availableAccounts.map(acc => ({
                label: `${acc.nickname || `Conta ID ${acc.id}`} (Saldo RP: ${acc.rp_amount.toLocaleString()})`.substring(0,100),
                description: `ID: ${acc.id} | Saldo Suficiente`.substring(0,100),
                value: acc.id.toString()
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_rp_account_for_order_${orderId}`)
                .setPlaceholder('Selecione a conta para debitar o RP...')
                .addOptions(selectOptions.slice(0, 25)); // Limite de 25 opções do Discord

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle(`💰 Selecionar Conta para Débito - Pedido #${orderId}`)
                .setColor('#2db8ec')
                .setDescription(`O pagamento para o pedido **#${orderId}** (Total: **${order.total_rp.toLocaleString()} RP**) foi aprovado.\n\nSelecione de qual conta o RP deve ser debitado:`)
                .setFooter({text: `Admin: ${interaction.user.tag} | ID do Pedido: ${orderId}`})
                .setTimestamp();
            
             await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Error presenting account selection for debit:', error);
            await interaction.followUp({ content: '❌ Erro ao apresentar seleção de contas.', ephemeral: true });
        }
    }

    static async processOrderDebit(interaction, orderId, selectedAccountId) {
        try {
            await interaction.deferUpdate();

            const order = await OrderLog.findById(orderId);
            const account = await Account.findById(selectedAccountId); // Assume que Account.findById existe
            const adminUserId = interaction.user.id;

            if (!order) return interaction.editReply({ content: '❌ Pedido não encontrado.', embeds:[], components: [] });
            if (!account) return interaction.editReply({ content: '❌ Conta de RP não encontrada.', embeds:[], components: [] });

            if (order.status !== 'AWAITING_DEBIT_ACCOUNT_SELECTION') {
                 return interaction.editReply({ content: `⚠️ Este pedido não está aguardando débito (Status: ${order.status})`, embeds:[], components: [] });
            }

            if (account.rp_amount < order.total_rp) {
                return interaction.editReply({ content: `❌ A conta selecionada (${account.nickname || `ID ${account.id}`}) não possui RP suficiente (${account.rp_amount.toLocaleString()} RP) para cobrir o pedido de ${order.total_rp.toLocaleString()} RP.`, embeds:[], components: [] });
            }

            const newBalance = account.rp_amount - order.total_rp;
            await Account.updateBalance(selectedAccountId, newBalance); // Assume Account.updateBalance existe

            await OrderLog.assignAdminAndAccount(orderId, adminUserId, selectedAccountId, 'COMPLETED', `Debitado da conta ${account.nickname || `ID ${account.id}`}. Saldo anterior: ${account.rp_amount}, debitado: ${order.total_rp}, novo saldo: ${newBalance}.`);

            const successEmbed = new EmbedBuilder()
                .setTitle(`✅ Pedido #${orderId} Processado com Sucesso!`)
                .setColor('#5cb85c')
                .setDescription(`O RP foi debitado da conta **${account.nickname || `ID ${account.id}`}**.\n` +
                                `Saldo anterior: ${account.rp_amount.toLocaleString()} RP\n` +
                                `Valor debitado: ${order.total_rp.toLocaleString()} RP\n` +
                                `Novo saldo: ${newBalance.toLocaleString()} RP`)
                .addFields(
                    {name: 'Processado por', value: interaction.user.tag, inline: true},
                    {name: 'Cliente', value: `<@${order.user_id}>`, inline: true}
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [successEmbed], components: [] });

            // Notificar o cliente no canal do pedido
            try {
                const orderChannel = await interaction.client.channels.fetch(order.order_channel_id).catch(() => null);
                if (orderChannel && orderChannel.isTextBased()) {
                    const clientEmbed = new EmbedBuilder()
                        .setTitle("🎉 Pedido Aprovado e Processado!")
                        .setColor('#5cb85c')
                        .setDescription("Seu pedido foi aprovado, o pagamento confirmado e os itens/RP foram processados!\n\nObrigado por comprar conosco!")
                        .setFooter({text: `ID do Pedido: ${orderId}`})
                        .setTimestamp();
                    await orderChannel.send({ content: `<@${order.user_id}>`, embeds: [clientEmbed] });
                } else {
                     console.warn(`Canal do pedido ${order.order_channel_id} não encontrado ou não é de texto para notificar cliente do pedido #${orderId}.`);
                }
            } catch (channelError) {
                console.error("Error fetching order channel or sending client notification:", channelError);
                const adminLogChannelId = config.adminLogChannelId || config.orderApprovalChannelId;
                if (adminLogChannelId) {
                    const adminLogChannel = await interaction.client.channels.fetch(adminLogChannelId).catch(() => null);
                    if (adminLogChannel && adminLogChannel.isTextBased()) {
                        adminLogChannel.send(`⚠️ Erro ao notificar cliente <@${order.user_id}> sobre o Pedido #${orderId} no canal <#${order.order_channel_id}>. Por favor, notifique manualmente.`);
                    }
                }
            }

        } catch (error) {
            console.error('Error processing order debit:', error);
            await interaction.editReply({ content: '❌ Erro ao processar débito do pedido.', embeds:[], components: [] });
        }
    }

    static async rejectPayment(interaction, orderId) {
        try {
            const modal = new ModalBuilder()
                .setCustomId(`reject_order_reason_modal_${orderId}`)
                .setTitle(`Rejeitar Pedido #${orderId}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId('rejection_reason')
                .setLabel('Motivo da Rejeição (para o cliente)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Ex: Comprovante inválido, pagamento não recebido, etc.')
                .setRequired(false) // Pode ser opcional se houver notas internas
                .setMaxLength(500);
            
            const internalNotesInput = new TextInputBuilder()
                .setCustomId('internal_notes')
                .setLabel('Notas Internas (opcional, para a equipe)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Detalhes adicionais.')
                .setRequired(false)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput), new ActionRowBuilder().addComponents(internalNotesInput));
            await interaction.showModal(modal);

        } catch (error) {
            console.error('Error initiating payment rejection:', error);
            await interaction.reply({ content: '❌ Erro ao iniciar rejeição do pagamento.', ephemeral: true });
        }
    }
    
    static async finalizeRejection(interaction, orderId, reasonForClient, internalNotes) {
        try {
            await interaction.deferReply({ephemeral: true}); // Ação de admin, pode ser efêmera
            const adminUserId = interaction.user.id;

            const fullAdminNotes = `Cliente: ${reasonForClient || 'N/A'} | Interno: ${internalNotes || 'N/A'}`;
            await OrderLog.setRejected(orderId, adminUserId, fullAdminNotes);
            
            const order = await OrderLog.findById(orderId);
            if (!order) return interaction.editReply({content: '❌ Pedido não encontrado após tentativa de rejeição.'});

            const rejectionEmbed = new EmbedBuilder()
                .setTitle(`❌ Pedido #${orderId} Rejeitado`)
                .setColor('#d9534f')
                .setDescription(`O pedido foi marcado como rejeitado pelo admin ${interaction.user.tag}.`)
                .addFields(
                    { name: 'Motivo para o cliente', value: reasonForClient || 'Não especificado.' },
                    { name: 'Notas Internas Completas', value: fullAdminNotes }
                )
                .setTimestamp();

            const adminChannelId = config.orderApprovalChannelId || config.adminLogChannelId;
             if (!adminChannelId) {
                 console.error("ID do canal de aprovação/log de pedidos não configurado em config.json para rejeição.");
                 return interaction.editReply({ content: `✅ Pedido #${orderId} rejeitado, mas não foi possível logar no canal de admin (ID não configurado).`});
            }
            const adminChannel = await interaction.client.channels.fetch(adminChannelId).catch(() => null);

            if (adminChannel && adminChannel.isTextBased()) {
                // Tentar editar a mensagem original se tivermos o ID, senão enviar nova
                // Por simplicidade, enviaremos uma nova confirmação de rejeição.
                // A mensagem original com botões de aprovar/rejeitar pode ser apenas desabilitada ou removida manualmente.
                await adminChannel.send({embeds: [rejectionEmbed]});

                // Opcional: Desabilitar botões na mensagem original de aprovação/rejeição
                if (interaction.message && interaction.message.components.length > 0) {
                    const disabledComponents = interaction.message.components.map(row => {
                        const newRow = new ActionRowBuilder();
                        row.components.forEach(component => {
                            newRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
                        });
                        return newRow;
                    });
                    await interaction.message.edit({ components: disabledComponents }).catch(console.error);
                }
            }
            
            await interaction.editReply({ content: `✅ Pedido #${orderId} rejeitado com sucesso.`});

            // Notificar o cliente
            try {
                const orderChannel = await interaction.client.channels.fetch(order.order_channel_id).catch(() => null);
                if (orderChannel && orderChannel.isTextBased()) {
                    const clientEmbed = new EmbedBuilder()
                        .setTitle("😥 Pedido Rejeitado")
                        .setColor('#d9534f')
                        .setDescription("Infelizmente, houve um problema com o seu pedido e ele foi rejeitado.")
                        .addFields({ name: "Motivo", value: reasonForClient || "Por favor, entre em contato com o suporte para mais detalhes."})
                        .setFooter({text: `ID do Pedido: ${orderId}`})
                        .setTimestamp();
                    await orderChannel.send({ content: `<@${order.user_id}>`, embeds: [clientEmbed] });
                } else {
                    console.warn(`Canal do pedido ${order.order_channel_id} não encontrado para notificar cliente da rejeição do pedido #${orderId}.`);
                }
            } catch (channelError) {
                 console.error("Error fetching order channel or sending client rejection notification:", channelError);
                 if (adminChannel && adminChannel.isTextBased()) { // Log no canal de admin se falhar
                     adminChannel.send(`⚠️ Erro ao notificar cliente <@${order.user_id}> sobre a REJEIÇÃO do Pedido #${orderId} no canal <#${order.order_channel_id}>. Por favor, notifique manualmente.`)
                 }
            }

        } catch (error) {
            console.error("Error in finalizeRejection:", error);
            await interaction.editReply({content: '❌ Erro ao finalizar a rejeição do pedido.'});
        }
    }
}

module.exports = OrderService;