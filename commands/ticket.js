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
    { id: 'genel', label: 'Genel Destek', emoji: '🎫', renk: 0x5865F2, kanalAdi: 'genel-destek' },
    { id: 'teknik', label: 'Teknik Destek', emoji: '🔧', renk: 0x57F287, kanalAdi: 'teknik-destek' },
    { id: 'sikayet', label: 'Şikayet', emoji: '📋', renk: 0xFEE75C, kanalAdi: 'sikayet' },
    { id: 'ban_itiraz', label: 'Ban İtiraz', emoji: '🔨', renk: 0xED4245, kanalAdi: 'ban-itiraz' }
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
                color: '#FFB6C1',
                categories: []
            }
        });
    }
    return global.ticketSetups.get(key);
}

function generateTicketWizardEmbed(session, guildName) {
    const categoriesList = (session.customization.categories && session.customization.categories.length > 0)
        ? session.customization.categories.map((c, i) => `• **${c.emoji} ${c.label}** (Kanal: \`${c.kanalAdi}\`)`).join('\n')
        : 'Varsayılan Türler:\n• 🎫 Genel Destek\n• 🔧 Teknik Destek\n• 📋 Şikayet\n• 🔨 Ban İtiraz';

    const embed = new EmbedBuilder()
        .setColor(session.customization?.color || '#FFB6C1')
        .setTitle('🛠️ Ticket Kurulum Sihirbazı')
        .setDescription(`Aşağıdaki paneli kullanarak ticket sisteminizi özelleştirin.\n\n` +
            `📝 **Panel Mesajı:** \`${(session.mesaj || 'Varsayılan').substring(0, 50)}${(session.mesaj || '').length > 50 ? '...' : ''}\`\n` +
            `🖼️ **Panel Resmi:** ${session.resimUrl ? `[Tıkla](${session.resimUrl})` : '`Belirtilmedi`'}\n` +
            `📂 **Ticket Kategorisi:** ${session.kategoriId ? `<#${session.kategoriId}>` : '`Ayarlanmadı`'}\n` +
            `👤 **Yetkili Rolü:** ${session.yetkiliRolId ? `<@&${session.yetkiliRolId}>` : '`Ayarlanmadı`'}\n` +
            `📋 **Log Kanalı:** ${session.logKanalId ? `<#${session.logKanalId}>` : '`Ayarlanmadı`'}`)
        .addFields({
            name: '📂 Destek Türleri',
            value: categoriesList
        })
        .setTimestamp()
        .setFooter({ text: `${guildName} | Ticket Yönetim Paneli` });

    return embed;
}

function generateTicketWizardButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_ticket_basic').setLabel('✍️ Görsel Ayarları').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ticket_categories').setLabel('➕ Tür Ekle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ticket_categories_clear').setLabel('🗑️ Sıfırla').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_ticket_launch').setLabel('🚀 Paneli Kur').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup_ticket_cancel').setLabel('❌ İptal').setStyle(ButtonStyle.Danger)
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
                .setDescription('Ticket kurulum sihirbazını açar')
                .addChannelOption(opt => opt.setName('kategori').setDescription('Ticket kanallarının açılacağı kategori').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
                .addRoleOption(opt => opt.setName('yetkili_rol').setDescription('Ticketlere bakacak yetkili rolü').setRequired(true))
                .addChannelOption(opt => opt.setName('log_kanal').setDescription('Ticket loglarının gönderileceği kanal').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('ekle')
                .setDescription('Ticket kanalına üye ekler')
                .addUserOption(opt => opt.setName('uye').setDescription('Eklenecek üye').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('cikar')
                .setDescription('Ticket kanalından üye çıkarır')
                .addUserOption(opt => opt.setName('uye').setDescription('Çıkarılacak üye').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('kapat')
                .setDescription('Ticket kanalını kapatır')
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'kurulum') {
            // Kullanıcının zaten kurulumu var mı kontrol et
            const existingSession = global.ticketSetups.get(`${guildId}-${interaction.user.id}`);
            if (existingSession && existingSession.kategoriId) {
                // Eğer kurulum varsa ve butonlarla devam ediyorsa, tekrar açma
                const embed = generateTicketWizardEmbed(existingSession, interaction.guild.name);
                const buttons = generateTicketWizardButtons();
                return interaction.reply({
                    content: '⚠️ Zaten devam eden bir kurulumun var! Aşağıdan devam edebilirsin.',
                    embeds: [embed],
                    components: buttons,
                    ephemeral: true
                });
            }

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
            await interaction.deferReply({ ephemeral: true });
            const memberTarget = interaction.options.getMember('uye');
            if (!memberTarget) return interaction.editReply('❌ Üye bulunamadı.');

            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            if (!ticket) return interaction.editReply('❌ Bu komutu sadece ticket kanallarında kullanabilirsin.');

            await interaction.channel.permissionOverwrites.edit(memberTarget.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
            });

            await interaction.editReply(`✅ ${memberTarget} ticket'a eklendi.`);
            await interaction.channel.send(`📥 ${memberTarget} ticket'a eklendi.`);
        }

        else if (subcommand === 'cikar') {
            await interaction.deferReply({ ephemeral: true });
            const memberTarget = interaction.options.getMember('uye');
            if (!memberTarget) return interaction.editReply('❌ Üye bulunamadı.');

            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            if (!ticket) return interaction.editReply('❌ Bu komutu sadece ticket kanallarında kullanabilirsin.');

            if (memberTarget.id === ticket.creatorId) {
                return interaction.editReply('❌ Ticket sahibini çıkaramazsın.');
            }

            await interaction.channel.permissionOverwrites.edit(memberTarget.id, {
                ViewChannel: false
            });

            await interaction.editReply(`✅ ${memberTarget} ticket'dan çıkarıldı.`);
        }

        else if (subcommand === 'kapat') {
            const ticket = ticketManager.tickets.find(t => t.channelId === interaction.channel.id);
            if (!ticket) return interaction.reply({ content: '❌ Bu komutu sadece ticket kanallarında kullanabilirsin.', ephemeral: true });

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
    },

    // ─── HANDLE SETUP BUTTONS ───
    async handleSetupButton(interaction) {
        const customId = interaction.customId;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (!customId.startsWith('setup_ticket_')) return;

        const session = getSetupSession(guildId, userId);

        // Eğer session'da kategori yoksa hata ver
        if (!session.kategoriId && customId !== 'setup_ticket_cancel') {
            return interaction.reply({
                content: '❌ Önce `/ticket kurulum` komutunu çalıştırmalısın!',
                ephemeral: true
            });
        }

        if (customId === 'setup_ticket_basic') {
            const modal = new ModalBuilder()
                .setCustomId('setup_modal_ticket_basic')
                .setTitle('🎫 Görsel Ayarları');

            const msgInput = new TextInputBuilder()
                .setCustomId('panel_message')
                .setLabel('Panel Mesajı')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Destek talebi oluşturmak için tıklayın...')
                .setValue(session.mesaj || 'Destek talebi oluşturmak için aşağıdaki kategorilerden birine tıklayın.')
                .setRequired(true)
                .setMaxLength(4000);

            const imgInput = new TextInputBuilder()
                .setCustomId('panel_image')
                .setLabel('Resim URL')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://ornek.com/resim.png')
                .setValue(session.resimUrl || '')
                .setRequired(false);

            const colInput = new TextInputBuilder()
                .setCustomId('panel_color')
                .setLabel('Renk (Hex)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('#FFB6C1')
                .setValue(session.customization.color || '#FFB6C1')
                .setRequired(false)
                .setMaxLength(7);

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
                .setTitle('➕ Tür Ekle');

            const nameInput = new TextInputBuilder()
                .setCustomId('category_name')
                .setLabel('Tür Adı')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: Ortaklık')
                .setRequired(true)
                .setMaxLength(100);

            const emojiInput = new TextInputBuilder()
                .setCustomId('category_emoji')
                .setLabel('Emoji')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: 🤝')
                .setRequired(true)
                .setMaxLength(10);

            const prefixInput = new TextInputBuilder()
                .setCustomId('category_prefix')
                .setLabel('Kanal Öneki')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Örn: ortaklik')
                .setRequired(true)
                .setMaxLength(50);

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
            // Kategori, yetkili rol ve log kanalı kontrol et
            if (!session.kategoriId || !session.yetkiliRolId || !session.logKanalId) {
                return interaction.reply({
                    content: '❌ Kategori, Yetkili Rolü ve Log Kanalı belirtilmeli! `/ticket kurulum` komutunu kullan.',
                    ephemeral: true
                });
            }

            // Kategori ve kanalların varlığını kontrol et
            const category = interaction.guild.channels.cache.get(session.kategoriId);
            if (!category) {
                return interaction.reply({
                    content: '❌ Kategori bulunamadı! Lütfen tekrar `/ticket kurulum` yap.',
                    ephemeral: true
                });
            }

            const finalEmbed = new EmbedBuilder()
                .setColor(session.customization.color || '#FFB6C1')
                .setDescription(session.mesaj || 'Destek talebi oluşturmak için aşağıdaki kategorilerden birine tıklayın.')
                .setTimestamp()
                .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() });

            if (session.resimUrl) finalEmbed.setImage(session.resimUrl);

            const allTypes = [...defaultTypes, ...session.customization.categories];
            
            const buttons = allTypes.map(cat => 
                new ButtonBuilder()
                    .setCustomId(`ticket_ac_${cat.id}`)
                    .setLabel(cat.label)
                    .setEmoji(cat.emoji || '🎫')
                    .setStyle(cat.id === 'ban_itiraz' ? ButtonStyle.Danger : ButtonStyle.Success)
            );

            const rows = [];
            for (let i = 0; i < buttons.length; i += 3) {
                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
            }

            // Panel mesajını gönder
            const message = await interaction.channel.send({
                embeds: [finalEmbed],
                components: rows
            });

            // Ayarları kaydet
            await updateSettings(guildId, {
                ticket_kategori: session.kategoriId,
                ticket_yetkili_rol: session.yetkiliRolId,
                ticket_log_kanal: session.logKanalId
            });

            global.ticketKategoris.set(guildId, session.kategoriId);
            global.ticketYetkiliRols.set(guildId, session.yetkiliRolId);
            global.ticketLogKanals.set(guildId, session.logKanalId);

            // Oturumu temizle
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
                content: '❌ **Kurulum iptal edildi.**',
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
            
            // Kara liste kontrolü
            if (ticketManager.blacklist.includes(userId)) {
                return interaction.reply({
                    content: '❌ Ticket kara listesindesin!',
                    ephemeral: true
                });
            }

            // Açık ticket kontrolü
            const existingTicket = ticketManager.tickets.find(
                t => t.creatorId === userId && t.guildId === guildId && t.status === 'open'
            );

            if (existingTicket) {
                return interaction.reply({
                    content: `❌ Zaten açık ticket var! <#${existingTicket.channelId}>`,
                    ephemeral: true
                });
            }

            // Global ayarları al
            const kategoriId = global.ticketKategoris.get(guildId);
            const yetkiliRolId = global.ticketYetkiliRols.get(guildId);
            const logKanalId = global.ticketLogKanals.get(guildId);

            if (!kategoriId) {
                return interaction.reply({
                    content: '❌ Ticket sistemi kurulmamış! Yöneticiden `/ticket kurulum` yapmasını iste.',
                    ephemeral: true
                });
            }

            const category = interaction.guild.channels.cache.get(kategoriId);
            if (!category) {
                return interaction.reply({
                    content: '❌ Kategori bulunamadı! Yöneticiden tekrar `/ticket kurulum` yapmasını iste.',
                    ephemeral: true
                });
            }

            // Ticket tipini bul
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

                // Ticket'ı kaydet
                ticketManager.tickets.push({
                    channelId: channel.id,
                    creatorId: interaction.user.id,
                    guildId: guildId,
                    type: ticketType,
                    status: 'open',
                    createdAt: Date.now(),
                });

                // Ticket embed'i
                const embed = new EmbedBuilder()
                    .setColor(typeInfo.renk || 0x5865F2)
                    .setTitle(`${typeInfo.emoji || '🎫'} ${typeInfo.label}`)
                    .setDescription(`Merhaba ${interaction.user}, destek talebin oluşturuldu.`)
                    .addFields(
                        { name: '👤 Sahip', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📂 Tür', value: typeInfo.label, inline: true },
                        { name: '📅 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
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

                // Log kanalına mesaj gönder
                const logChannel = interaction.guild.channels.cache.get(logKanalId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('🎫 Yeni Ticket')
                        .setDescription(`<@${interaction.user.id}> ticket oluşturdu.`)
                        .addFields(
                            { name: '📂 Tür', value: typeInfo.label, inline: true },
                            { name: '🔗 Kanal', value: `<#${channel.id}>`, inline: true }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }

                await interaction.reply({
                    content: `✅ Ticket oluşturuldu! <#${channel.id}>`,
                    ephemeral: true
                });

            } catch (error) {
                console.error('Ticket hatası:', error);
                await interaction.reply({
                    content: '❌ Ticket oluşturulurken hata oluştu!',
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
                    content: '❌ Ticket kapatmaya yetkin yok!',
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
                    content: '❌ Ticket sahiplenmeye yetkin yok!',
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

        if (customId === 'setup_modal_ticket_basic') {
            try {
                const guildId = interaction.guild.id;
                const userId = interaction.user.id;
                const session = getSetupSession(guildId, userId);

                const mesaj = interaction.fields.getTextInputValue('panel_message');
                const resim = interaction.fields.getTextInputValue('panel_image');
                const color = interaction.fields.getTextInputValue('panel_color');

                session.mesaj = mesaj || 'Destek talebi oluşturmak için tıklayın.';
                session.resimUrl = resim ? resim.trim() : null;
                session.customization.color = color || '#FFB6C1';

                const embed = generateTicketWizardEmbed(session, interaction.guild.name);
                const buttons = generateTicketWizardButtons();

                await interaction.update({ embeds: [embed], components: buttons });
            } catch (error) {
                console.error('Modal hatası:', error);
                await interaction.reply({
                    content: '❌ Bir hata oluştu! Lütfen tekrar dene.',
                    ephemeral: true
                });
            }
        }

        else if (customId === 'setup_modal_ticket_categories') {
            try {
                const guildId = interaction.guild.id;
                const userId = interaction.user.id;
                const session = getSetupSession(guildId, userId);

                const name = interaction.fields.getTextInputValue('category_name');
                const emoji = interaction.fields.getTextInputValue('category_emoji');
                const prefix = interaction.fields.getTextInputValue('category_prefix').toLowerCase().replace(/[^a-z0-9]/g, '');

                const newCategory = {
                    id: `custom_${Date.now()}`,
                    label: name || 'Destek',
                    emoji: emoji || '🎫',
                    renk: 0x5865F2,
                    kanalAdi: prefix || 'destek'
                };

                session.customization.categories.push(newCategory);

                const embed = generateTicketWizardEmbed(session, interaction.guild.name);
                const buttons = generateTicketWizardButtons();

                await interaction.update({ embeds: [embed], components: buttons });
            } catch (error) {
                console.error('Kategori hatası:', error);
                await interaction.reply({
                    content: '❌ Kategori eklenirken hata oluştu!',
                    ephemeral: true
                });
            }
        }

        else if (customId === 'ticket_ekle_modal') {
            try {
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
                    content: `✅ ${targetUser} ticket'a eklendi.`,
                    ephemeral: true
                });

                await interaction.channel.send(`📥 ${targetUser} ticket'a eklendi.`);
            } catch (error) {
                console.error('Ekleme hatası:', error);
                await interaction.reply({
                    content: '❌ Kullanıcı eklenirken hata oluştu!',
                    ephemeral: true
                });
            }
        }

        else if (customId === 'ban_itiraz_modal') {
            try {
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
                    .setDescription(reason || 'Belirtilmedi')
                    .addFields(
                        { name: '👤 Başvuran', value: `<@${ticket.creatorId}>`, inline: true },
                        { name: '📅 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await interaction.channel.send({ embeds: [embed] });
                await interaction.reply({
                    content: '✅ Ban itirazın gönderildi.',
                    ephemeral: true
                });
            } catch (error) {
                console.error('İtiraz hatası:', error);
                await interaction.reply({
                    content: '❌ İtiraz gönderilirken hata oluştu!',
                    ephemeral: true
                });
            }
        }
    },

    // ─── INIT ───
    init(client) {
        ticketManager.init(client);
        console.log('[Ticket] Ticket sistemi başlatıldı.');
    }
};
