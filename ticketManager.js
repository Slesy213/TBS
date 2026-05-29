const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');

const { updateSettings } = require('./db.js');

let dbData = { tickets: [], staffStats: {}, blacklist: [] };

function loadFromSettings() {
    dbData.tickets.length = 0;
    for (const key in dbData.staffStats) delete dbData.staffStats[key];
    dbData.blacklist.length = 0;

    for (const [guildId, gs] of global.guardSettings.entries()) {
        if (gs.tickets && Array.isArray(gs.tickets)) {
            dbData.tickets.push(...gs.tickets);
        }
        if (gs.staffStats) {
            Object.assign(dbData.staffStats, gs.staffStats);
        }
        if (gs.blacklist && Array.isArray(gs.blacklist)) {
            dbData.blacklist.push(...gs.blacklist);
        }
    }
    console.log(`[TICKET DEBUG] Hafızaya ${dbData.tickets.length} aktif bilet yüklendi.`);
}

async function saveGuildTickets(guildId) {
    if (!guildId) return;
    try {
        const guildTickets = dbData.tickets.filter(t => t.guildId === guildId);
        const guildStaffStats = {};
        for (const [staffId, stats] of Object.entries(dbData.staffStats)) {
            guildStaffStats[staffId] = stats;
        }

        await updateSettings(guildId, {
            guard_settings: {
                ...global.guardSettings.get(guildId),
                tickets: guildTickets,
                staffStats: guildStaffStats,
                blacklist: dbData.blacklist
            }
        });

        const gs = global.guardSettings.get(guildId) || {};
        gs.tickets = guildTickets;
        gs.staffStats = guildStaffStats;
        gs.blacklist = dbData.blacklist;
        global.guardSettings.set(guildId, gs);
    } catch (e) {
        console.error(`❌ Supabase bilet güncelleme hatası (Guild: ${guildId}):`, e);
    }
}

const defaultTypes = [
    { id: 'genel', label: 'Genel Destek', emoji: '🎫', renk: 0x5865F2, kanalAdi: 'genel-destek', roleId: null },
    { id: 'teknik', label: 'Teknik Destek', emoji: '🔧', renk: 0x57F287, kanalAdi: 'teknik-destek', roleId: null },
    { id: 'sikayet', label: 'Şikayet', emoji: '📋', renk: 0xFEE75C, kanalAdi: 'sikayet', roleId: null },
    { id: 'ban_itiraz', label: 'Ban İtiraz', emoji: '🔨', renk: 0xED4245, kanalAdi: 'ban-itiraz', roleId: null }
];

function getCategories(guildId) {
    const settings = global.guardSettings.get(guildId) || {};
    if (settings.ticketCategories && Array.isArray(settings.ticketCategories) && settings.ticketCategories.length > 0) {
        return settings.ticketCategories;
    }
    return defaultTypes;
}

// ─── HELPER: ESCAPE HTML ───
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ─── TRANSCRIPT GENERATORS ───
async function generateTranscriptHTML(channel, ticketInfo) {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return '';

    const sorted = Array.from(messages.values()).reverse();

    let html = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <title>${channel.name} - Transcript</title>
        <style>
            body { background-color: #36393f; color: #dcddde; font-family: sans-serif; padding: 20px; }
            .message { display: flex; margin-bottom: 15px; }
            .avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 15px; }
            .content { display: flex; flex-direction: column; }
            .header { display: flex; align-items: center; margin-bottom: 5px; }
            .author { font-weight: bold; color: #ffffff; margin-right: 10px; }
            .time { font-size: 0.8em; color: #72767d; }
            .body { color: #dcddde; }
            .embed { border-left: 4px solid #5865f2; background-color: #2f3136; padding: 10px; margin-top: 5px; border-radius: 4px; }
            .embed-title { font-weight: bold; color: #ffffff; margin-bottom: 5px; }
            .embed-desc { color: #b9bbbe; }
        </style>
    </head>
    <body>
        <h2>🎫 Ticket Sohbet Geçmişi: ${channel.name}</h2>
        <p>Açan: &lt;@${ticketInfo.creatorId}&gt; | Tür: ${ticketInfo.type} | Tarih: ${new Date(ticketInfo.openedAt).toLocaleString('tr-TR')}</p>
        <hr/>
        <div class="messages">
    `;

    for (const msg of sorted) {
        if (msg.author.bot && msg.embeds.length === 0 && msg.content === '') continue;

        const avatarUrl = msg.author.displayAvatarURL({ size: 64 });
        html += `
        <div class="message">
            <img class="avatar" src="${avatarUrl}" alt="avatar">
            <div class="content">
                <div class="header">
                    <span class="author">${msg.author.tag}</span>
                    <span class="time">${msg.createdAt.toLocaleString('tr-TR')}</span>
                </div>
                <div class="body">${escapeHtml(msg.content)}</div>
        `;

        if (msg.embeds.length > 0) {
            for (const emb of msg.embeds) {
                html += `
                <div class="embed">
                    ${emb.title ? `<div class="embed-title">${escapeHtml(emb.title)}</div>` : ''}
                    ${emb.description ? `<div class="embed-desc">${escapeHtml(emb.description)}</div>` : ''}
                </div>
                `;
            }
        }

        html += `
            </div>
        </div>
        `;
    }

    html += `
        </div>
    </body>
    </html>
    `;
    return html;
}

async function generateTranscriptTXT(channel, ticketInfo) {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return '';
    const sorted = Array.from(messages.values()).reverse();

    let txt = `Ticket Raporu: ${channel.name}\n`;
    txt += `Açılış: ${new Date(ticketInfo.openedAt).toLocaleString('tr-TR')}\n\n`;
    for (const msg of sorted) {
        txt += `[${msg.createdAt.toLocaleString('tr-TR')}] ${msg.author.tag}: ${msg.content}\n`;
        if (msg.embeds.length > 0) {
            for (const emb of msg.embeds) {
                txt += `  [Embed] ${emb.title || ''} - ${emb.description || ''}\n`;
            }
        }
    }
    return txt;
}

// ─── LOG EVENT TO CHANNEL ───
async function logTicketEvent(guild, eventTitle, description, color = 0x5865F2, files = []) {
    const logChId = global.ticketLogKanals.get(guild.id);
    if (!logChId) return;
    const logCh = guild.channels.cache.get(logChId);
    if (!logCh) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎫 Slesy Destek | ${eventTitle}`)
        .setDescription(description)
        .setTimestamp();

    await logCh.send({ embeds: [embed], files }).catch(() => {});
}

// ─── ACTUAL TICKET CHANNEL OPEN ───
async function openTicketChannel(interaction, category) {
    console.log(`[TICKET DEBUG] openTicketChannel çağrıldı. Kategori: ${category.label}`);
    await interaction.deferReply({ ephemeral: true });

    try {
        const guild = interaction.guild;
        const user = interaction.user;
        const guildId = guild.id;

        const ticketKategori = global.ticketKategoris.get(guildId);
        const ticketYetkiliRol = global.ticketYetkiliRols.get(guildId);

        console.log(`[TICKET DEBUG] Kategori: ${ticketKategori}, Yetkili Rolü: ${ticketYetkiliRol}`);

        if (!ticketKategori || !ticketYetkiliRol) {
            console.log(`[TICKET DEBUG] Kategori veya Yetkili Rolü tanımlı değil!`);
            return interaction.editReply({
                content: '❌ Ticket sistemi henüz kurulmamış veya veritabanında ayarlar eksik! Lütfen önce `/ticket kurulum` komutunu çalıştırarak paneli kurun.'
            });
        }

        // Active limit check: Max 1 active ticket per category per user
        const hasActive = dbData.tickets.some(t => 
            t.guildId === guildId && 
            t.creatorId === user.id && 
            t.status === 'open' && 
            t.type === category.id
        );

        if (hasActive) {
            console.log(`[TICKET DEBUG] Kullanıcının zaten açık ticketı var.`);
            return interaction.editReply({
                content: `❌ Zaten bu kategoride açık bir destek talebiniz bulunuyor.`
            });
        }

        // Blacklist user check
        if (dbData.blacklist.includes(user.id)) {
            console.log(`[TICKET DEBUG] Kullanıcı kara listede.`);
            return interaction.editReply({
                content: '❌ Destek sisteminden kara listeye alındığınız için bilet açamazsınız.'
            });
        }

        // Requirements checks
        const settings = global.guardSettings.get(guildId) || {};
        const minAccountAge = settings.ticketMinAccountAge || 0;
        if (minAccountAge > 0) {
            const ageDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (ageDays < minAccountAge) {
                console.log(`[TICKET DEBUG] Hesap yaş sınırı yetersiz.`);
                return interaction.editReply({
                    content: `❌ Hesabınız en az **${minAccountAge} günlük** olmalıdır. (Mevcut: **${Math.floor(ageDays)} günlük**)`
                });
            }
        }

        const minServerAge = settings.ticketMinServerAge || 0;
        if (minServerAge > 0) {
            const joinDays = (Date.now() - interaction.member.joinedTimestamp) / (1000 * 60 * 60 * 24);
            if (joinDays < minServerAge) {
                console.log(`[TICKET DEBUG] Sunucu üyelik süresi yetersiz.`);
                return interaction.editReply({
                    content: `❌ Sunucuya en az **${minServerAge} gün önce** katılmış olmalısınız. (Mevcut: **${Math.floor(joinDays)} gündür buradasınız**)`
                });
            }
        }

        const permissionOverwrites = [
            {
                id: guild.roles.everyone,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ];

        const targetRoleId = category.roleId || ticketYetkiliRol;
        if (targetRoleId) {
            permissionOverwrites.push({
                id: targetRoleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            });
        }

        console.log(`[TICKET DEBUG] Kanal oluşturuluyor...`);
        const channel = await guild.channels.create({
            name: `${category.kanalAdi}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            type: ChannelType.GuildText,
            parent: ticketKategori,
            permissionOverwrites: permissionOverwrites
        });
        console.log(`[TICKET DEBUG] Kanal oluşturuldu: ${channel.name} (${channel.id})`);

        const ticketInfo = {
            channelId: channel.id,
            guildId,
            creatorId: user.id,
            type: category.id,
            status: 'open',
            claimedBy: null,
            openedAt: Date.now(),
            closedAt: null,
            lastMessageAt: Date.now(),
            priority: 'Orta',
            notes: [],
            rating: null,
            feedbackText: null
        };

        dbData.tickets.push(ticketInfo);
        await saveGuildTickets(guildId);

        const ticketEmbed = new EmbedBuilder()
            .setColor(category.renk || 0x5865F2)
            .setTitle(`${category.emoji} ${category.label}`)
            .setDescription(`👋 Destek kanalına hoş geldiniz <@${user.id}>.\nLütfen sorununuzu detaylıca yazınız, yetkililerimiz en kısa sürede yardımcı olacaktır.`)
            .addFields(
                { name: '👤 Bilet Sahibi', value: `<@${user.id}>`, inline: true },
                { name: '📂 Kategori', value: `${category.label}`, inline: true },
                { name: '📊 Öncelik', value: 'Orta', inline: true }
            )
            .setTimestamp();

        const sahiplen = new ButtonBuilder().setCustomId('ticket_sahiplen').setLabel('👤 Sahiplen').setStyle(ButtonStyle.Primary);
        const birak = new ButtonBuilder().setCustomId('ticket_birak').setLabel('🚪 Bırak').setStyle(ButtonStyle.Secondary);
        const ekle = new ButtonBuilder().setCustomId('ticket_ekle_btn').setLabel('➕ Ekle').setStyle(ButtonStyle.Success);
        const kapat = new ButtonBuilder().setCustomId('ticket_kapat').setLabel('🔒 Kapat').setStyle(ButtonStyle.Danger);
        const arsivle = new ButtonBuilder().setCustomId('ticket_arsivle').setLabel('📂 Arşivle').setStyle(ButtonStyle.Danger);

        await channel.send({
            content: `<@${user.id}> | <@&${targetRoleId}> yetkilileri buraya davet edildi.`,
            embeds: [ticketEmbed],
            components: [
                new ActionRowBuilder().addComponents(sahiplen, birak, ekle, kapat, arsivle)
            ]
        });

        await logTicketEvent(
            guild,
            'Ticket Açıldı',
            `❓ **Ticket:** <#${channel.id}>\n👤 **Açan:** <@${user.id}>\n📂 **Destek Türü:** \`${category.label}\``,
            0x57F287
        );

        await interaction.editReply({
            content: `✅ Destek talebiniz oluşturuldu → <#${channel.id}>`
        });

        return channel;
    } catch (error) {
        console.error('❌ Ticket kanalı açılırken hata:', error);
        try {
            await interaction.editReply({
                content: `❌ Destek kanalı oluşturulamadı. Hata: ${error.message || error}`
            });
        } catch {}
        return null;
    }
}

// ─── TICKETS CLOSING ───
async function closeTicket(client, channelId, closedByUserId) {
    const t = dbData.tickets.find(x => x.channelId === channelId);
    if (!t) return { success: false, reason: 'Ticket veritabanında bulunamadı.' };
    if (t.status === 'closed') return { success: false, reason: 'Ticket zaten kapalı.' };

    t.status = 'closed';
    t.closedAt = Date.now();
    t.closedBy = closedByUserId;
    await saveGuildTickets(t.guildId);

    // Increment staff stats
    if (t.claimedBy) {
        const stats = dbData.staffStats[t.claimedBy] || { claimedCount: 0, closedCount: 0, ratings: [] };
        stats.closedCount++;
        dbData.staffStats[t.claimedBy] = stats;
        await saveGuildTickets(t.guildId);
    }

    const guild = client.guilds.cache.get(t.guildId);
    if (!guild) return { success: true };

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return { success: true };

    const htmlTranscript = await generateTranscriptHTML(channel, t);
    const txtTranscript = await generateTranscriptTXT(channel, t);

    const htmlBuffer = Buffer.from(htmlTranscript, 'utf-8');
    const txtBuffer = Buffer.from(txtTranscript, 'utf-8');

    const htmlAttachment = new AttachmentBuilder(htmlBuffer, { name: `transcript_${channelId}.html` });
    const txtAttachment = new AttachmentBuilder(txtBuffer, { name: `transcript_${channelId}.txt` });

    await logTicketEvent(
        guild, 
        'Ticket Kapatıldı', 
        `❓ **Ticket:** \`${channel.name}\`\n👤 **Açan:** <@${t.creatorId}>\n🔒 **Kapatan:** <@${closedByUserId}>\n📋 **Öncelik:** \`${t.priority || 'Belirtilmedi'}\`\n📂 **Destek Türü:** \`${t.type}\``, 
        0xED4245, 
        [htmlAttachment, txtAttachment]
    );

    // Send rating DM
    const creator = await guild.members.fetch(t.creatorId).catch(() => null);
    if (creator) {
        const ratingEmbed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🌟 Destek Deneyiminizi Değerlendirin!')
            .setDescription(`Merhaba <@${t.creatorId}>,\n\n**${guild.name}** sunucusunda oluşturduğunuz destek talebi kapatılmıştır.\nSize yardımcı olan ekibimizi değerlendirmek için lütfen aşağıdaki butonlardan bir puan seçiniz.`);

        const ratingRow = new ActionRowBuilder().addComponents(
            [1, 2, 3, 4, 5].map(star =>
                new ButtonBuilder()
                    .setCustomId(`ticket_rate_${star}_${channelId}`)
                    .setLabel(`${star} ⭐`)
                    .setStyle(ButtonStyle.Primary)
            )
        );

        await creator.send({ embeds: [ratingEmbed], components: [ratingRow] }).catch(() => {});
        
        const dmHtmlAttachment = new AttachmentBuilder(htmlBuffer, { name: `transcript_${channelId}.html` });
        await creator.send({ content: '📄 Destek görüşmenizin geçmiş kayıtları:', files: [dmHtmlAttachment] }).catch(() => {});
    }

    const alertEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🔒 Ticket Kapatılıyor')
        .setDescription(`Ticket <@${closedByUserId}> tarafından kapatıldı. Kanal 5 saniye içinde silinecektir.`);

    await channel.send({ embeds: [alertEmbed] }).catch(() => {});

    setTimeout(() => {
        channel.delete().catch(() => {});
    }, 5000);

    return { success: true };
}

// ─── INITIALIZE TICKET LIFECYCLE ───
function init(client) {
    // 1. INACTIVE CHECK
    setInterval(async () => {
        const now = Date.now();
        const inactiveTime = 24 * 60 * 60 * 1000; 

        for (const t of dbData.tickets) {
            if (t.status !== 'open') continue;

            const lastActive = t.lastMessageAt || t.openedAt;
            if (now - lastActive > inactiveTime) {
                const guild = client.guilds.cache.get(t.guildId);
                if (!guild) continue;

                const channel = guild.channels.cache.get(t.channelId);
                if (!channel) continue;

                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle('⏰ Hareketsizlik Uyarısı')
                            .setDescription('Bu destek talebi 24 saattir hareketsiz olduğu için otomatik olarak kapatılacaktır.')
                            .setTimestamp()
                    ]
                }).catch(() => {});

                setTimeout(async () => {
                    await closeTicket(client, t.channelId, client.user.id);
                }, 5000);
            }
        }
    }, 300000);

    // 2. TRACK MESSAGES & FAQ
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;
        const t = dbData.tickets.find(x => x.channelId === message.channel.id);
        if (t) {
            t.lastMessageAt = Date.now();
            await saveGuildTickets(t.guildId);

            const content = message.content.toLowerCase();
            const faqs = [
                { keys: ['ödeme', 'odeme', 'fiyat', 'satın al', 'satin al'], reply: '💳 **Ödeme İşlemleri:** Fiyat listemize ve ödeme yöntemlerimize sitemizden ulaşabilirsiniz. Destek ekibimiz kısa süre içinde ödeme kanallarını iletecektir.' },
                { keys: ['kayıt', 'kayit', 'üye', 'uye'], reply: '📝 **Kayıt İşlemleri:** Kayıt olmak için lütfen tam adınızı ve e-posta adresinizi buraya yazın.' },
                { keys: ['hata', 'hata alıyorum', 'calismıyor', 'çalışmıyor'], reply: '🔧 **Teknik Hata:** Aldığınız hatanın ekran görüntüsünü (SS) veya log kaydını bu kanala gönderirseniz teknik ekibimiz hızlıca yardımcı olacaktır.' }
            ];

            for (const faq of faqs) {
                if (faq.keys.some(k => content.includes(k))) {
                    await message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0x3498DB)
                                .setTitle('🤖 Slesy Asistan - Sıkça Sorulan Sorular')
                                .setDescription(faq.reply)
                                .setFooter({ text: 'Not: Bu otomatik bir yanıttır. Yetkililerimiz de cevap verecektir.' })
                        ]
                    }).catch(() => {});
                    break;
                }
            }
        }
    });

    // 3. GLOBAL INTERACTION LISTENER
    client.on('interactionCreate', async (interaction) => {
        try {
            const guildId = interaction.guild?.id;
            const userId = interaction.user.id;
            const customId = interaction.customId;

            console.log(`[TICKET DEBUG] interactionCreate alındı: ${customId}`);

            // BUTTON CLICKS
            if (interaction.isButton()) {
                if (customId.startsWith('ticket_ac_')) {
                    const turId = customId.replace('ticket_ac_', '');
                    const categories = getCategories(guildId);
                    const tur = categories.find(t => t.id === turId) || defaultTypes.find(t => t.id === turId);
                    console.log(`[TICKET DEBUG] Buton tıklandı: ${customId}, Kategori Bulundu: ${tur ? tur.label : 'Bulunamadı'}`);
                    if (!tur) {
                        return interaction.reply({
                            content: `❌ Hata: Bu butonun ait olduğu destek kategorisi (\`${turId}\`) sistemde bulunamadı. Lütfen paneli tekrar kurun.`,
                            ephemeral: true
                        }).catch(() => {});
                    }

                    // Ban Appeal Form Modal popup
                    if (turId === 'ban_itiraz') {
                        const modal = new ModalBuilder()
                            .setCustomId('ban_itiraz_modal')
                            .setTitle('Ban İtiraz Formu');

                        const sebepInput = new TextInputBuilder()
                            .setCustomId('ban_sebep')
                            .setLabel('Ban Sebebi')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        const itirazInput = new TextInputBuilder()
                            .setCustomId('ban_itiraz_metni')
                            .setLabel('Neden Banınız Kaldırılmalı?')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        modal.addComponents(
                            new ActionRowBuilder().addComponents(sebepInput),
                            new ActionRowBuilder().addComponents(itirazInput)
                        );

                        return interaction.showModal(modal);
                    }

                    await openTicketChannel(interaction, tur);
                }

                else if (customId === 'ticket_sahiplen') {
                    const t = dbData.tickets.find(x => x.channelId === interaction.channel.id);
                    if (!t) return interaction.reply({ content: '❌ Ticket bulunamadı.', ephemeral: true });

                    const ticketYetkiliRol = global.ticketYetkiliRols.get(guildId);
                    if (ticketYetkiliRol && !interaction.member.roles.cache.has(ticketYetkiliRol)) {
                        return interaction.reply({ content: '❌ Bu işlemi gerçekleştirmek için yetkili olmalısınız.', ephemeral: true });
                    }

                    if (t.claimedBy) {
                        return interaction.reply({ content: `⚠️ Bu ticket zaten <@${t.claimedBy}> tarafından sahiplenilmiş.`, ephemeral: true });
                    }

                    t.claimedBy = userId;
                    await saveGuildTickets(guildId);

                    const stats = dbData.staffStats[userId] || { claimedCount: 0, closedCount: 0, ratings: [] };
                    stats.claimedCount++;
                    dbData.staffStats[userId] = stats;
                    await saveGuildTickets(guildId);

                    const claimEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setDescription(`👤 Bu destek talebi ${interaction.user} tarafından sahiplenildi.`)
                        .setTimestamp();

                    await interaction.reply({ embeds: [claimEmbed] });
                }

                else if (customId === 'ticket_birak') {
                    const t = dbData.tickets.find(x => x.channelId === interaction.channel.id);
                    if (!t) return interaction.reply({ content: '❌ Ticket bulunamadı.', ephemeral: true });

                    if (t.claimedBy !== userId) {
                        return interaction.reply({ content: '❌ Bu ticketi sadece sahiplenen yetkili bırakabilir.', ephemeral: true });
                    }

                    t.claimedBy = null;
                    await saveGuildTickets(guildId);

                    const releaseEmbed = new EmbedBuilder()
                        .setColor(0x34495E)
                        .setDescription(`🚪 ${interaction.user} ticket sahiplenmesini bıraktı. Ticket sıraya geri alındı.`)
                        .setTimestamp();

                    await interaction.reply({ embeds: [releaseEmbed] });
                }

                else if (customId === 'ticket_ekle_btn') {
                    const modal = new ModalBuilder()
                        .setCustomId('ticket_ekle_modal_direct')
                        .setTitle('Tickete Kullanıcı Ekle');

                    const userInput = new TextInputBuilder()
                        .setCustomId('eklencek_user_id')
                        .setLabel('Kullanıcı ID')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Eklemek istediğiniz üyenin ID\'sini yazın')
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(userInput));
                    await interaction.showModal(modal);
                }

                else if (customId === 'ticket_kapat') {
                    await interaction.deferUpdate().catch(() => {});
                    await closeTicket(client, interaction.channel.id, userId);
                }

                else if (customId === 'ticket_arsivle') {
                    const t = dbData.tickets.find(x => x.channelId === interaction.channel.id);
                    if (!t) return interaction.reply({ content: '❌ Ticket bulunamadı.', ephemeral: true });

                    t.status = 'archived';
                    await saveGuildTickets(guildId);

                    await interaction.reply({ content: '📂 Ticket başarıyla arşivlendi. Yetkiler güncelleniyor...', ephemeral: true });

                    await interaction.channel.permissionOverwrites.edit(t.creatorId, {
                        ViewChannel: false
                    }).catch(() => {});

                    const archiveEmbed = new EmbedBuilder()
                        .setColor(0xE67E22)
                        .setDescription(`📂 Ticket <@${userId}> tarafından arşivlendi. Kullanıcı erişimi kapatıldı.`)
                        .setTimestamp();

                    await interaction.channel.send({ embeds: [archiveEmbed] });
                }

                else if (customId.startsWith('ticket_rate_')) {
                    const parts = customId.split('_');
                    const rating = parseInt(parts[2]);
                    const tId = parts[3];

                    const t = dbData.tickets.find(x => x.channelId === tId);
                    if (!t) return interaction.reply({ content: '❌ Ticket verisi bulunamadı veya süre aşımına uğramış.', ephemeral: true });

                    const modal = new ModalBuilder()
                        .setCustomId(`ticket_feedback_modal_${rating}_${tId}`)
                        .setTitle('🌟 Deneyiminizi Paylaşın');

                    const feedbackInput = new TextInputBuilder()
                        .setCustomId('feedback_comment')
                        .setLabel('Yorumunuz (İsteğe bağlı)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false);

                    modal.addComponents(new ActionRowBuilder().addComponents(feedbackInput));
                    await interaction.showModal(modal);
                }
            }

            // MODAL SUBMITS
            else if (interaction.isModalSubmit()) {
                console.log(`[TICKET DEBUG] Modal submit alındı: ${customId}`);
                if (customId === 'ban_itiraz_modal') {
                    const sebep = interaction.fields.getTextInputValue('ban_sebep');
                    const itiraz = interaction.fields.getTextInputValue('ban_itiraz_metni');

                    const categories = getCategories(guildId);
                    const category = categories.find(t => t.id === 'ban_itiraz') || defaultTypes.find(t => t.id === 'ban_itiraz');

                    const channel = await openTicketChannel(interaction, category);
                    if (channel) {
                        const embedApp = new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle('🔨 Ban İtiraz Başvurusu')
                            .addFields(
                                { name: 'Sebep', value: sebep },
                                { name: 'İtiraz Metni', value: itiraz }
                            )
                            .setTimestamp();
                        await channel.send({ embeds: [embedApp] }).catch(() => {});
                    }
                }

                else if (customId.startsWith('ticket_ekle_modal_direct')) {
                    const userIdVal = interaction.fields.getTextInputValue('eklencek_user_id');
                    try {
                        const member = await interaction.guild.members.fetch(userIdVal);
                        await interaction.channel.permissionOverwrites.edit(member.id, {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true,
                        });
                        await interaction.reply({ content: `✅ <@${member.id}> tickete eklendi.` });
                    } catch {
                        await interaction.reply({ content: '❌ Geçersiz kullanıcı ID\'si girdiniz.', ephemeral: true });
                    }
                }

                else if (customId.startsWith('ticket_feedback_modal_')) {
                    const parts = customId.split('_');
                    const rating = parseInt(parts[3]);
                    const tId = parts[4];
                    const comment = interaction.fields.getTextInputValue('feedback_comment') || '';

                    const t = dbData.tickets.find(x => x.channelId === tId);
                    if (t) {
                        t.rating = rating;
                        t.feedbackText = comment;
                        await saveGuildTickets(guildId);

                        if (t.claimedBy) {
                            const stats = dbData.staffStats[t.claimedBy] || { claimedCount: 0, closedCount: 0, ratings: [] };
                            stats.ratings.push(rating);
                            dbData.staffStats[t.claimedBy] = stats;
                            await saveGuildTickets(guildId);
                        }

                        await interaction.reply({ content: `✅ Geri bildiriminiz için teşekkür ederiz! (${rating}/5 ⭐)`, ephemeral: true });

                        const guild = client.guilds.cache.get(t.guildId);
                        if (guild) {
                            const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
                            await logTicketEvent(
                                guild, 
                                'Kullanıcı Değerlendirmesi', 
                                `👤 **Kullanıcı:** <@${t.creatorId}>\n💼 **İlgilenen Yetkili:** ${t.claimedBy ? `<@${t.claimedBy}>` : 'Yok'}\n📊 **Puan:** \`${stars}\` (\`${rating}/5\`)\n📝 **Yorum:** ${comment || '*Yorum belirtilmedi*'}`
                            );
                        }
                    } else {
                        await interaction.reply({ content: '❌ Hata: Geri bildirim kaydedilemedi.', ephemeral: true });
                    }
                }
            }
        } catch (error) {
            console.error('❌ Ticket Etkileşim Hatası:', error);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: `❌ Hata: ${error.message || error}`, components: [] });
                } else {
                    await interaction.reply({ content: `❌ Hata: ${error.message || error}`, ephemeral: true, components: [] });
                }
            } catch {}
        }
    });
}

module.exports = {
    tickets: dbData.tickets,
    staffStats: dbData.staffStats,
    blacklist: dbData.blacklist,
    init,
    closeTicket,
    saveGuildTickets,
    loadFromSettings,
    getCategories
};
