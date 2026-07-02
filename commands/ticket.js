const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');

const ticketManager = require('../ticketManager.js');
const { updateSettings } = require('../db.js');

global.ticketSetups = global.ticketSetups || new Map();

const defaultTypes = [
    { id: 'genel', label: 'Genel Destek', emoji: '🎫', renk: 0x5865F2, kanalAdi: 'genel-destek', roleId: null },
    { id: 'teknik', label: 'Teknik Destek', emoji: '🔧', renk: 0x57F287, kanalAdi: 'teknik-destek', roleId: null },
    { id: 'sikayet', label: 'Şikayet', emoji: '📋', renk: 0xFEE75C, kanalAdi: 'sikayet', roleId: null },
    { id: 'ban_itiraz', label: 'Ban İtiraz', emoji: '🔨', renk: 0xED4245, kanalAdi: 'ban-itiraz', roleId: null }
];

function getSetupSession(guildId, userId) {
    const key = `${guildId}-${userId}`;
    if (!global.ticketSetups.has(key)) {
        global.ticketSetups.set(key, {
            mesaj: 'Destek talebi oluşturmak için aşağıdaki kategorilerden birine tıklayın.',
            resimUrl: null,
            kategoriId: null,
            yetkiliRolId: null,
            logKanalId: null,
            customization: {
                color: '#5865F2',
                categories: []
            }
        });
    }
    return global.ticketSetups.get(key);
}

function generateTicketWizardEmbed(session, guildName) {
    const categoriesList = (session.customization.categories && session.customization.categories.length > 0)
        ? session.customization.categories.map((c, i) => `• **${c.emoji} ${c.label}** (ID: \`${c.id}\`, Kanal: \`${c.kanalAdi}\`)`).join('\n')
        : 'Varsayılan Türler Aktif:\n• 🎫 Genel Destek\n• 🔧 Teknik Destek\n• 📋 Şikayet\n• 🔨 Ban İtiraz';

    const embed = new EmbedBuilder()
        .setColor(session.customization?.color || '#5865F2')
        .setTitle('🛠️ Ticket Kurulum Sihirbazı')
        .setDescription(`Aşağıdaki paneli kullanarak ticket sisteminizi özelleştirin.\n\n` +
            `📝 **Panel Mesajı:** \`${session.mesaj || 'Varsayılan'}\`\n` +
            `🖼️ **Panel Resmi:** \`${session.resimUrl || 'Belirtilmedi'}\`\n` +
            `📂 **Ticket Kategorisi:** ${session.kategoriId ? `<#${session.kategoriId}>` : '`Ayarlanmadı`'}\n` +
            `👤 **Yetkili Rolü:** ${session.yetkiliRolId ? `<@&${session.yetkiliRolId}>` : '`Ayarlanmadı`'}\n` +
            `📋 **Log Kanalı:** ${session.logKanalId ? `<#${session.logKanalId}>` : '`Ayarlanmadı`'}`)
        .addFields({
            name: '📂 Destek Türleri / Kategorileri',
            value: categoriesList
        })
        .setTimestamp()
        .setFooter({ text: `${guildName} | Ticket Yönetim Paneli` });

    return embed;
}

function generateTicketWizardButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_ticket_basic').setLabel('✍️ Görsel & Panel Ayarları').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ticket_categories').setLabel('➕ Özel Destek Türü Ekle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ticket_categories_clear').setLabel('🗑️ Türleri Sıfırla').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_ticket_launch').setLabel('🚀 Paneli Kur ve Aktifleştir').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup_ticket_cancel').setLabel('❌ Kurulumu İptal Et').setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Gelişmiş destek talebi (ticket) sistemi')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('kurulum')
                .setDescription('İnteraktif ticket kurulum sihirbazını açar')
                .addChannelOption(opt => opt.setName('kategori').setDescription('Destek talebi kanallarının açılacağı kategori').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
                .addRoleOption(opt => opt.setName('yetkili_rol').setDescription('Destek taleplerine bakacak yetkili rolü').setRequired(true))
                .addChannelOption(opt => opt.setName('log_kanal').setDescription('Destek talebi loglarının gönderileceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('ekle')
                .setDescription('Destek kanalına bir üye ekler')
                .addUserOption(opt => opt.setName('uye').setDescription('Eklenecek üye').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('çıkar')
                .setDescription('Destek kanalından bir üyeyi çıkarır')
                .addUserOption(opt => opt.setName('uye').setDescription('Çıkarılacak üye').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('kapat')
                .setDescription('Destek kanalını kapatır')
        ),

    async execute(interaction, client) {
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'kurulum') {
            const kategori = interaction.options.getChannel('kategori');
            const yetkiliRol = interaction.options.getRole('yetkili_rol');
            const logKanal = interaction.options.getChannel('log_kanal');

            const session = getSetupSession(guildId, interaction.user.id);
            session.kategoriId = kategori.id;
            session.yetkiliRolId = yetkiliRol.id;
            session.logKanalId = logKanal.id;

            const embed = generateTicketWizardEmbed(session, interaction.guild.name);
            const buttons = generateTicketWizardButtons();

            await interaction.reply({
                embeds: [embed],
                components: buttons,
                ephemeral: true
            });
        }

        else if (subcommand === 'ekle') {
            await interaction.deferReply();
            const memberTarget = interaction.options.getMember('uye');
            if (!memberTarget) return interaction.editReply('❌ Üye bulunamadı.');

            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.editReply('❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.');

            await interaction.channel.permissionOverwrites.edit(memberTarget.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            });

            await interaction.editReply(`✅ ${memberTarget} başarıyla destek talebine eklendi.`);
        }

        else if (subcommand === 'çıkar') {
            await interaction.deferReply();
            const memberTarget = interaction.options.getMember('uye');
            if (!memberTarget) return interaction.editReply('❌ Üye bulunamadı.');

            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.editReply('❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.');

            if (memberTarget.id === t.creatorId) {
                return interaction.editReply('❌ Destek talebinin sahibini kanaldan çıkaramazsınız.');
            }

            await interaction.channel.permissionOverwrites.edit(memberTarget.id, {
                ViewChannel: false
            });

            await interaction.editReply(`✅ ${memberTarget} başarıyla destek talebinden çıkarıldı.`);
        }

        else if (subcommand === 'kapat') {
            const t = await ticketManager.getTicket(interaction.channel.id);
            if (!t) return interaction.reply({ content: '❌ Bu komutu sadece destek kanallarında kullanabilirsiniz.', ephemeral: true });

            await interaction.reply('🔒 Destek talebi kapatılıyor...');
            await ticketManager.closeTicket(client, interaction.channel.id, interaction.user.id);
        }
    },

    // ─── HANDLE SETUP BUTTONS ───
    async handleSetupButton(interaction) {
        const customId = interaction.customId;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (!customId.startsWith('setup_ticket_')) return;

        const session = getSetupSession(guildId, userId);

        if (customId === 'setup_ticket_basic') {
            const modal = new ModalBuilder()
                .setCustomId('setup_modal_ticket_basic')
                .setTitle('🎫 Ticket Görsel & Metin Ayarları');

            const msgInput = new TextInputBuilder()
                .setCustomId('panel_message')
                .setLabel('Panel Açıklama Mesajı')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Destek talebi açmak için aşağıdaki butonlara tıklayın.')
                .setValue(session.mesaj)
                .setRequired(true);

            const imgInput = new TextInputBuilder()
                .setCustomId('panel_image')
                .setLabel('Panel Görsel Resmi (URL)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://example.com/logo.png')
                .setValue(session.resimUrl || '')
                .setRequired(false);

            const colInput = new TextInputBuilder()
                .setCustomId('panel_color')
                .setLabel('Panel Hex Rengi')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('#5865F2')
                .setValue(session.customization.color)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(msgInput),
                new ActionRowBuilder().addComponents(imgInput),
                new ActionRowBuilder().addComponents(colInput)
            );

            await interaction.showModal(modal);
        }

        else if (customId === 'setup_ticket_categories') {
            const modal = new ModalBuilder()
                .setCustomId('setup_modal_ticket_categories')
                .setTitle('➕ Özel Destek Türü Ekle');

            const nameInput = new TextInputBuilder()
                .setCustomId('category_name')
                .setLabel('Destek Türü Adı')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: Ortaklık Anlaşmaları')
                .setRequired(true);

            const emojiInput = new TextInputBuilder()
                .setCustomId('category_emoji')
                .setLabel('Emoji')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: 🤝')
                .setRequired(true);

            const prefixInput = new TextInputBuilder()
                .setCustomId('category_prefix')
                .setLabel('Kanal Öneki')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: ortaklik')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(emojiInput),
                new ActionRowBuilder().addComponents(prefixInput)
            );

            await interaction.showModal(modal);
        }

        else if (customId === 'setup_ticket_categories_clear') {
            session.customization.categories = [];
            const embed = generateTicketWizardEmbed(session, interaction.guild.name);
            const buttons = generateTicketWizardButtons();
            await interaction.update({ embeds: [embed], components: buttons });
        }

        else if (customId === 'setup_ticket_launch') {
            if (!session.kategoriId || !session.yetkiliRolId || !session.logKanalId) {
                return interaction.reply({
                    content: '❌ Hata: Kategori, Yetkili Rolü ve Log Kanalı belirtilmeli.',
                    ephemeral: true
                });
            }

            const finalEmbed = new EmbedBuilder()
                .setColor(session.customization.color || '#5865F2')
                .setDescription(session.mesaj)
                .setTimestamp();

            if (session.resimUrl) finalEmbed.setImage(session.resimUrl);

            const categories = session.customization.categories.length > 0 
                ? session.customization.categories 
                : defaultTypes;

            const buttons = categories.map(cat => 
                new ButtonBuilder()
                    .setCustomId(`ticket_ac_${cat.id}`)
                    .setLabel(cat.label)
                    .setEmoji(cat.emoji)
                    .setStyle(cat.id === 'ban_itiraz' ? ButtonStyle.Danger : ButtonStyle.Success)
            );

            const rows = [];
            for (let i = 0; i < buttons.length; i += 3) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
            }

            const message = await interaction.channel.send({
                embeds: [finalEmbed],
                components: rows
            });

            await updateSettings(guildId, {
                ticket_kategori: session.kategoriId,
                ticket_yetkili_rol: session.yetkiliRolId,
                ticket_log_kanal: session.logKanalId
            });

            global.ticketKategoris.set(guildId, session.kategoriId);
            global.ticketYetkiliRols.set(guildId, session.yetkiliRolId);
            global.ticketLogKanals.set(guildId, session.logKanalId);

            global.ticketSetups.delete(`${guildId}-${userId}`);

            await interaction.update({
                content: `✅ **Ticket paneli başarıyla kuruldu!**\n[Panel Mesajı](${interaction.channel.url}/${message.id})`,
                embeds: [],
                components: []
            });
        }

        else if (customId === 'setup_ticket_cancel') {
            global.ticketSetups.delete(`${guildId}-${userId}`);
            await interaction.update({
                content: '❌ **Ticket kurulum sihirbazı iptal edildi.**',
                embeds: [],
                components: []
            });
        }
    },

    // ─── HANDLE BUTTON ───
    async handleButton(interaction) {
        const customId = interaction.customId;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (customId.startsWith('ticket_ac_')) {
            const ticketType = customId.replace('ticket_ac_', '');
            
            if (ticketManager.blacklist.includes(userId)) {
                return interaction.reply({
                    content: '❌ Ticket kara listesindesin!',
                    ephemeral: true
                });
            }

            const existingTicket = ticketManager.tickets.find(
                t => t.creatorId === userId && t.guildId === guildId && t.status === 'open'
            );

            if (existingTicket) {
                return interaction.reply({
                    content: `❌ Zaten açık bir destek talebin var! <#${existingTicket.channelId}>`,
                    ephemeral: true
                });
            }

            const kategoriId = global.ticketKategoris.get(guildId);
            const yetkiliRolId = global.ticketYetkiliRols.get(guildId);
            const logKanalId = global.ticketLogKanals.get(guildId);

            if (!kategoriId) {
                return interaction.reply({
                    content: '❌ Ticket sistemi henüz kurulmamış!',
                    ephemeral: true
                });
            }

            const category = interaction.guild.channels.cache.get(kategoriId);
            if (!category) {
                return interaction.reply({
                    content: '❌ Ticket kategorisi bulunamadı!',
                    ephemeral: true
                });
            }

            const allTypes = [...defaultTypes, ...(global.guardSettings.get(guildId)?.ticketCategories || [])];
            const typeInfo = allTypes.find(t => t.id === ticketType);

            if (!typeInfo) {
                return interaction.reply({
                    content: '❌ Geçersiz ticket tipi!',
                    ephemeral: true
                });
            }

            const channelName = `${typeInfo.kanalAdi || 'destek'}-${interaction.user.username.toLowerCase()}`;

            try {
                const channel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: category.id,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionFlagsBits.ViewChannel],
                        },
                        {
                            id: interaction.user.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.EmbedLinks,
                            ],
                        },
                        {
                            id: yetkiliRolId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.ManageMessages,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.EmbedLinks,
                            ],
                        },
                    ],
                });

                ticketManager.tickets.push({
                    channelId: channel.id,
                    creatorId: interaction.user.id,
                    guildId: guildId,
                    type: ticketType,
                    status: 'open',
                    createdAt: Date.now(),
                });

                const embed = new EmbedBuilder()
                    .setColor(typeInfo.renk || 0x5865F2)
                    .setTitle(`${typeInfo.emoji} ${typeInfo.label}`)
                    .setDescription(`Merhaba ${interaction.user}, destek talebin oluşturuldu.`)
                    .addFields(
                        { name: '👤 Talep Sahibi', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📂 Tür', value: typeInfo.label, inline: true }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket_kapat')
                            .setLabel('🔒 Kapat')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('ticket_sahiplen')
                            .setLabel('📋 Sahiplen')
                            .setStyle(ButtonStyle.Primary)
                    );

                await channel.send({
                    content: `<@${interaction.user.id}> <@&${yetkiliRolId}>`,
                    embeds: [embed],
                    components: [row]
                });

                const logChannel = interaction.guild.channels.cache.get(logKanalId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('🎫 Yeni Destek Talebi')
                        .setDescription(`<@${interaction.user.id}> yeni bir destek talebi oluşturdu.`)
                        .addFields(
                            { name: '📂 Tür', value: typeInfo.label, inline: true },
                            { name: '🔗 Kanal', value: `<#${channel.id}>`, inline: true }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }

                await interaction.reply({
                    content: `✅ Destek talebin oluşturuldu! <#${channel.id}>`,
                    ephemeral: true
                });

            } catch (error) {
                console.error('Ticket oluşturma hatası:', error);
                await interaction.reply({
                    content: '❌ Ticket oluşturulurken bir hata oluştu!',
                    ephemeral: true
                });
            }
        }

        else if (customId === 'ticket_kapat') {
            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            if (!ticket) {
                return interaction.reply({
                    content: '❌ Bu bir ticket kanalı değil!',
                    ephemeral: true
                });
            }

            const yetkiliRolId = global.ticketYetkiliRols.get(guildId);
            const isAuthorized = interaction.member.roles.cache.has(yetkiliRolId) || 
                                interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isAuthorized && interaction.user.id !== ticket.creatorId) {
                return interaction.reply({
                    content: '❌ Bu ticket\'ı kapatmaya yetkin yok!',
                    ephemeral: true
                });
            }

            await interaction.reply('🔒 Ticket kapatılıyor...');
            ticket.status = 'closed';
            ticket.closedAt = Date.now();
            ticket.closedBy = interaction.user.id;

            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (err) {}
            }, 3000);
        }

        else if (customId === 'ticket_sahiplen') {
            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            if (!ticket) {
                return interaction.reply({
                    content: '❌ Bu bir ticket kanalı değil!',
                    ephemeral: true
                });
            }

            const yetkiliRolId = global.ticketYetkiliRols.get(guildId);
            const isAuthorized = interaction.member.roles.cache.has(yetkiliRolId) || 
                                interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isAuthorized) {
                return interaction.reply({
                    content: '❌ Bu ticket\'ı sahiplenmeye yetkin yok!',
                    ephemeral: true
                });
            }

            ticket.claimedBy = interaction.user.id;

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setDescription(`📋 Ticket <@${interaction.user.id}> tarafından sahiplenildi.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },

    // ─── HANDLE MODAL ───
    async handleModal(interaction) {
        const customId = interaction.customId;

        // Ticket ekle modal
        if (customId === 'ticket_ekle_modal') {
            const userId = interaction.fields.getTextInputValue('ticket_ekle_user');
            const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
            
            if (!targetUser) {
                return interaction.reply({
                    content: '❌ Geçersiz kullanıcı ID!',
                    ephemeral: true
                });
            }

            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            if (!ticket) {
                return interaction.reply({
                    content: '❌ Bu bir ticket kanalı değil!',
                    ephemeral: true
                });
            }

            await interaction.channel.permissionOverwrites.edit(targetUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            });

            await interaction.reply({
                content: `✅ ${targetUser} başarıyla ticket'a eklendi.`,
                ephemeral: true
            });

            await interaction.channel.send(`📥 ${targetUser} ticket'a eklendi.`);
        }

        // Setup modal - Basic
        else if (customId === 'setup_modal_ticket_basic') {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const session = getSetupSession(guildId, userId);

            const mesaj = interaction.fields.getTextInputValue('panel_message');
            const resim = interaction.fields.getTextInputValue('panel_image');
            const color = interaction.fields.getTextInputValue('panel_color');

            session.mesaj = mesaj;
            session.resimUrl = resim ? resim.trim() : null;
            if (color) session.customization.color = color.trim();

            const embed = generateTicketWizardEmbed(session, interaction.guild.name);
            const buttons = generateTicketWizardButtons();

            await interaction.update({ embeds: [embed], components: buttons });
        }

        // Setup modal - Add Category
        else if (customId === 'setup_modal_ticket_categories') {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            const session = getSetupSession(guildId, userId);

            const name = interaction.fields.getTextInputValue('category_name');
            const emoji = interaction.fields.getTextInputValue('category_emoji');
            const prefix = interaction.fields.getTextInputValue('category_prefix').toLowerCase().replace(/[^a-z0-9]/g, '');
            const uniqueId = `custom_${Date.now()}`;

            const newCategory = {
                id: uniqueId,
                label: name,
                emoji: emoji,
                renk: 0x5865F2,
                kanalAdi: prefix,
                roleId: null
            };

            session.customization.categories.push(newCategory);

            const embed = generateTicketWizardEmbed(session, interaction.guild.name);
            const buttons = generateTicketWizardButtons();

            await interaction.update({ embeds: [embed], components: buttons });
        }

        // Ban itiraz modal
        else if (customId === 'ban_itiraz_modal') {
            const reason = interaction.fields.getTextInputValue('ban_reason');
            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            
            if (!ticket) {
                return interaction.reply({
                    content: '❌ Bu bir ticket kanalı değil!',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('🔨 Ban İtirazı')
                .setDescription(reason)
                .addFields(
                    { name: '👤 Başvuran', value: `<@${ticket.creatorId}>`, inline: true },
                    { name: '📅 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({
                content: '✅ Ban itirazınız gönderildi. Yetkililer en kısa sürede inceleyecek.',
                ephemeral: true
            });
        }
    },

    // ─── INIT ───
    init(client) {
        ticketManager.init(client);
        console.log('[Ticket] Ticket sistemi başlatıldı.');
    }
};
