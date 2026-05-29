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

const { supabase, updateSettings } = require('./db.js');

let dbData = { tickets: [], staffStats: {}, blacklist: [] };

async function loadFromSettings() {
    dbData.tickets.length = 0;
    for (const key in dbData.staffStats) delete dbData.staffStats[key];
    dbData.blacklist.length = 0;

    for (const [guildId, gs] of global.guardSettings.entries()) {
        if (gs.staffStats) {
            Object.assign(dbData.staffStats, gs.staffStats);
        }
        if (gs.blacklist && Array.isArray(gs.blacklist)) {
            dbData.blacklist.push(...gs.blacklist);
        }
    }

    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*');

        if (error) {
            console.error('❌ Supabase biletleri yüklenirken hata oluştu:', error.message);
        } else if (data) {
            const mappedTickets = data.map(t => ({
                channelId: t.channel_id,
                guildId: t.guild_id,
                creatorId: t.creator_id,
                type: t.type,
                status: t.status,
                claimedBy: t.claimed_by,
                openedAt: Number(t.opened_at),
                closedAt: t.closed_at ? Number(t.closed_at) : null,
                lastMessageAt: Number(t.last_message_at),
                priority: t.priority,
                notes: Array.isArray(t.notes) ? t.notes : [],
                rating: t.rating,
                feedbackText: t.feedback_text,
                closedBy: t.closed_by
            }));
            dbData.tickets.push(...mappedTickets);
        }
    } catch (err) {
        console.error('❌ Supabase biletleri yükleme hatası:', err);
    }
    console.log(`[TICKET DEBUG] Hafızaya ${dbData.tickets.length} aktif bilet yüklendi.`);
}

async function saveGuildTickets(guildId) {
    if (!guildId) return;
    try {
        const guildTickets = dbData.tickets.filter(t => t.guildId === guildId);
        
        const rows = guildTickets.map(t => ({
            channel_id: t.channelId,
            guild_id: t.guildId,
            creator_id: t.creatorId,
            type: t.type,
            status: t.status,
            claimed_by: t.claimedBy,
            opened_at: t.openedAt,
            closed_at: t.closedAt,
            last_message_at: t.lastMessageAt,
            priority: t.priority,
            notes: t.notes,
            rating: t.rating,
            feedback_text: t.feedbackText,
            closed_by: t.closedBy
        }));

        if (rows.length > 0) {
            const { error } = await supabase
                .from('tickets')
                .upsert(rows, { onConflict: 'channel_id' });
            if (error) {
                console.error(`❌ Supabase ticket toplu upsert hatası:`, error.message);
            }
        }

        const guildStaffStats = {};
        for (const [staffId, stats] of Object.entries(dbData.staffStats)) {
            guildStaffStats[staffId] = stats;
        }

        await updateSettings(guildId, {
            guard_settings: {
                ...global.guardSettings.get(guildId),
                staffStats: guildStaffStats,
                blacklist: dbData.blacklist
            }
        });

        const gs = global.guardSettings.get(guildId) || {};
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
    
    const totalMsg = sorted.length;
    const botMsg = sorted.filter(m => m.author.bot).length;
    const userMsg = totalMsg - botMsg;
    const attachmentCount = sorted.reduce((sum, m) => sum + m.attachments.size, 0);
    const embedCount = sorted.reduce((sum, m) => sum + m.embeds.length, 0);

    const guild = channel.guild;
    const creatorUser = guild.members.cache.get(ticketInfo.creatorId)?.user || { tag: 'Bilinmeyen Kullanıcı#' + ticketInfo.creatorId, displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };
    const claimUser = ticketInfo.claimedBy ? (guild.members.cache.get(ticketInfo.claimedBy)?.user || { tag: 'Yetkili#' + ticketInfo.claimedBy, displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png' }) : null;

    const participants = {};
    for (const m of sorted) {
        if (!participants[m.author.id]) {
            participants[m.author.id] = {
                tag: m.author.tag,
                avatar: m.author.displayAvatarURL({ size: 32 }),
                count: 0,
                isBot: m.author.bot
            };
        }
        participants[m.author.id].count++;
    }

    let participantListHtml = '';
    for (const p of Object.values(participants)) {
        participantListHtml += `
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <img src="${p.avatar}" style="width: 24px; height: 24px; border-radius: 50%; margin-right: 8px;">
            <span style="color: ${p.isBot ? '#5865F2' : '#ffffff'}; font-size: 0.9em;">${escapeHtml(p.tag)} (${p.count} mesaj)</span>
        </div>
        `;
    }

    let html = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(channel.name)} - Premium Transcript</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Inter', sans-serif; background-color: #2f3136; color: #dcddde; display: flex; height: 100vh; overflow: hidden; }
            
            /* Sidebar */
            .sidebar { width: 320px; background-color: #202225; padding: 20px; display: flex; flex-direction: column; border-right: 1px solid #2f3136; overflow-y: auto; }
            .sidebar-title { font-size: 1.2em; font-weight: 700; color: #ffffff; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
            .meta-card { background-color: #2f3136; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .meta-item { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85em; border-bottom: 1px dashed #40444b; padding-bottom: 5px; }
            .meta-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
            .meta-label { color: #8e9297; }
            .meta-value { color: #ffffff; font-weight: 500; }
            
            /* Main Content */
            .main { flex: 1; display: flex; flex-direction: column; height: 100%; background-color: #36393f; }
            .header-bar { height: 60px; background-color: #36393f; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid #202225; }
            .header-title { font-size: 1.1em; font-weight: 600; color: #ffffff; }
            .search-box { background-color: #202225; border: none; padding: 8px 12px; border-radius: 4px; color: #ffffff; outline: none; width: 250px; font-size: 0.9em; }
            
            /* Chat Container */
            .chat-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
            .message-wrapper { display: flex; align-items: flex-start; }
            .message-wrapper:hover { background-color: #32353b; margin: 0 -20px; padding: 4px 20px; }
            .avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 16px; object-fit: cover; }
            .msg-content { display: flex; flex-direction: column; flex: 1; }
            .msg-header { display: flex; align-items: baseline; margin-bottom: 4px; }
            .author-name { font-weight: 600; color: #ffffff; margin-right: 8px; cursor: pointer; }
            .author-name:hover { text-decoration: underline; }
            .bot-tag { background-color: #5865F2; color: #ffffff; font-size: 0.65em; padding: 1px 4px; border-radius: 3px; margin-right: 8px; font-weight: 700; text-transform: uppercase; }
            .msg-time { font-size: 0.75em; color: #72767d; }
            .msg-body { font-size: 0.95em; color: #dcddde; line-height: 1.4; word-break: break-word; }
            
            /* Embeds */
            .embed-card { border-left: 4px solid #5865f2; background-color: #2f3136; padding: 12px; border-radius: 4px; margin-top: 8px; max-width: 520px; }
            .embed-title { font-weight: 600; color: #ffffff; margin-bottom: 6px; font-size: 0.95em; }
            .embed-description { color: #b9bbbe; font-size: 0.85em; line-height: 1.4; }
            
            /* Attachments */
            .attachment-card { margin-top: 8px; background-color: #2f3136; border: 1px solid #202225; padding: 10px; border-radius: 6px; display: flex; align-items: center; max-width: 400px; gap: 10px; }
            .attachment-icon { font-size: 1.5em; }
            .attachment-info { display: flex; flex-direction: column; overflow: hidden; }
            .attachment-name { color: #00b0f4; font-size: 0.85em; font-weight: 500; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
            .attachment-name:hover { text-decoration: underline; }
            .attachment-size { color: #72767d; font-size: 0.75em; }
            .attachment-image { margin-top: 8px; max-width: 400px; max-height: 300px; border-radius: 6px; border: 1px solid #202225; cursor: pointer; }
            
            /* Timeline component */
            .timeline { margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px; background-color: #2f3136; padding: 12px; border-radius: 6px; font-size: 0.8em; }
            .timeline-point { display: flex; align-items: center; gap: 8px; }
            .timeline-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #43b581; }
            .timeline-dot.orange { background-color: #faa61a; }
            .timeline-dot.red { background-color: #f04747; }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <div class="sidebar-title">🎫 Slesy Transcript</div>
            
            <div class="timeline">
                <div class="timeline-point">
                    <span class="timeline-dot"></span>
                    <span>Açılış: ${new Date(ticketInfo.openedAt).toLocaleString('tr-TR')}</span>
                </div>
                ${ticketInfo.claimedBy ? `
                <div class="timeline-point">
                    <span class="timeline-dot orange"></span>
                    <span>Sahiplenildi: <br><small>${escapeHtml(claimUser ? claimUser.tag : 'Yetkili')}</small></span>
                </div>
                ` : ''}
                ${ticketInfo.closedAt ? `
                <div class="timeline-point">
                    <span class="timeline-dot red"></span>
                    <span>Kapanış: ${new Date(ticketInfo.closedAt).toLocaleString('tr-TR')}</span>
                </div>
                ` : ''}
            </div>

            <div class="meta-card">
                <h4 style="margin-bottom: 10px; font-size: 0.9em; color: #ffffff;">Destek Bilgileri</h4>
                <div class="meta-item"><span class="meta-label">Kanal Adı</span><span class="meta-value">#${escapeHtml(channel.name)}</span></div>
                <div class="meta-item"><span class="meta-label">Bilet Sahibi</span><span class="meta-value">${escapeHtml(creatorUser.tag)}</span></div>
                <div class="meta-item"><span class="meta-label">Tür</span><span class="meta-value">${escapeHtml(ticketInfo.type)}</span></div>
                <div class="meta-item"><span class="meta-label">Öncelik</span><span class="meta-value">${escapeHtml(ticketInfo.priority || 'Orta')}</span></div>
                <div class="meta-item"><span class="meta-label">Durum</span><span class="meta-value">${escapeHtml(ticketInfo.status)}</span></div>
                ${ticketInfo.rating ? `
                <div class="meta-item"><span class="meta-label">Puan</span><span class="meta-value" style="color: #faa61a;">${'★'.repeat(ticketInfo.rating)}${'☆'.repeat(5 - ticketInfo.rating)}</span></div>
                ` : ''}
                ${ticketInfo.feedbackText ? `
                <div class="meta-item" style="flex-direction: column; align-items: flex-start; border-bottom: none;"><span class="meta-label">Geri Bildirim</span><span class="meta-value" style="margin-top: 4px; font-style: italic; white-space: normal;">"${escapeHtml(ticketInfo.feedbackText)}"</span></div>
                ` : ''}
            </div>

            <div class="meta-card">
                <h4 style="margin-bottom: 10px; font-size: 0.9em; color: #ffffff;">Sohbet İstatistikleri</h4>
                <div class="meta-item"><span class="meta-label">Toplam Mesaj</span><span class="meta-value">${totalMsg}</span></div>
                <div class="meta-item"><span class="meta-label">Kullanıcı Mesajları</span><span class="meta-value">${userMsg}</span></div>
                <div class="meta-item"><span class="meta-label">Bot Mesajları</span><span class="meta-value">${botMsg}</span></div>
                <div class="meta-item"><span class="meta-label">Ek / Dosyalar</span><span class="meta-value">${attachmentCount}</span></div>
                <div class="meta-item"><span class="meta-label">Embedler</span><span class="meta-value">${embedCount}</span></div>
            </div>

            <div class="meta-card">
                <h4 style="margin-bottom: 10px; font-size: 0.9em; color: #ffffff;">Katılımcılar</h4>
                ${participantListHtml}
            </div>
        </div>

        <div class="main">
            <div class="header-bar">
                <span class="header-title">💬 #${escapeHtml(channel.name)} Sohbet Kaydı</span>
                <input type="text" id="search" class="search-box" placeholder="Mesajlarda ara..." onkeyup="filterMessages()">
            </div>
            
            <div class="chat-container" id="chat">
    `;

    for (const msg of sorted) {
        if (msg.author.bot && msg.embeds.length === 0 && msg.content === '') continue;

        const avatarUrl = msg.author.displayAvatarURL({ size: 64 });
        html += `
        <div class="message-wrapper" data-author="${escapeHtml(msg.author.tag.toLowerCase())}" data-content="${escapeHtml(msg.content.toLowerCase())}">
            <img class="avatar" src="${avatarUrl}" alt="avatar">
            <div class="msg-content">
                <div class="msg-header">
                    <span class="author-name">${escapeHtml(msg.author.tag)}</span>
                    ${msg.author.bot ? '<span class="bot-tag">Bot</span>' : ''}
                    <span class="msg-time">${msg.createdAt.toLocaleString('tr-TR')}</span>
                </div>
                ${msg.content ? `<div class="msg-body">${escapeHtml(msg.content)}</div>` : ''}
        `;

        if (msg.attachments.size > 0) {
            for (const att of msg.attachments.values()) {
                const isImage = att.contentType && att.contentType.startsWith('image/');
                if (isImage) {
                    html += `<a href="${att.url}" target="_blank"><img class="attachment-image" src="${att.url}" alt="Attachment"></a>`;
                } else {
                    const sizeKB = (att.size / 1024).toFixed(1) + ' KB';
                    html += `
                    <div class="attachment-card">
                        <span class="attachment-icon">📁</span>
                        <div class="attachment-info">
                            <a href="${att.url}" target="_blank" class="attachment-name">${escapeHtml(att.name)}</a>
                            <span class="attachment-size">${sizeKB}</span>
                        </div>
                    </div>
                    `;
                }
            }
        }

        if (msg.embeds.length > 0) {
            for (const emb of msg.embeds) {
                const colorHex = emb.hexColor || '#5865f2';
                html += `
                <div class="embed-card" style="border-left-color: ${colorHex}">
                    ${emb.title ? `<div class="embed-title">${escapeHtml(emb.title)}</div>` : ''}
                    ${emb.description ? `<div class="embed-description">${escapeHtml(emb.description)}</div>` : ''}
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
        </div>
        <script>
            function filterMessages() {
                var query = document.getElementById('search').value.toLowerCase();
                var messages = document.getElementsByClassName('message-wrapper');
                for (var i = 0; i < messages.length; i++) {
                    var author = messages[i].getAttribute('data-author');
                    var content = messages[i].getAttribute('data-content');
                    if (author.includes(query) || content.includes(query)) {
                        messages[i].style.display = 'flex';
                    } else {
                        messages[i].style.display = 'none';
                    }
                }
            }
        </script>
    </body>
    </html>
    `;
    return html;
}

async function generateTranscriptTXT(channel, ticketInfo) {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) return '';
    const sorted = Array.from(messages.values()).reverse();

    const guild = channel.guild;
    const creatorUser = guild.members.cache.get(ticketInfo.creatorId)?.user || { tag: 'Bilinmeyen Kullanıcı#' + ticketInfo.creatorId };
    const claimUser = ticketInfo.claimedBy ? (guild.members.cache.get(ticketInfo.claimedBy)?.user || { tag: 'Yetkili#' + ticketInfo.claimedBy }) : null;

    let txt = `==================================================\n`;
    txt += `       SLESY TICKET SYSTEM PREMIUM REPORT        \n`;
    txt += `==================================================\n\n`;
    txt += `Bilet Bilgileri:\n`;
    txt += `--------------------------------------------------\n`;
    txt += `Kanal Adı:     #${channel.name} (${channel.id})\n`;
    txt += `Sunucu:        ${guild.name} (${guild.id})\n`;
    txt += `Açan Kullanıcı: ${creatorUser.tag} (${ticketInfo.creatorId})\n`;
    txt += `Destek Türü:   ${ticketInfo.type}\n`;
    txt += `Öncelik:       ${ticketInfo.priority || 'Orta'}\n`;
    txt += `Açılış Zamanı: ${new Date(ticketInfo.openedAt).toLocaleString('tr-TR')}\n`;
    if (ticketInfo.claimedBy) {
        txt += `Sahiplenen:    ${claimUser ? claimUser.tag : 'Yetkili'} (${ticketInfo.claimedBy})\n`;
    }
    if (ticketInfo.closedAt) {
        txt += `Kapanış:       ${new Date(ticketInfo.closedAt).toLocaleString('tr-TR')}\n`;
    }
    if (ticketInfo.rating) {
        txt += `Değerlendirme: ${ticketInfo.rating}/5 Yıldız\n`;
    }
    if (ticketInfo.feedbackText) {
        txt += `Geri Bildirim: "${ticketInfo.feedbackText}"\n`;
    }
    txt += `--------------------------------------------------\n\n`;
    
    txt += `Sohbet Geçmişi:\n`;
    txt += `==================================================\n`;
    for (const msg of sorted) {
        txt += `[${msg.createdAt.toLocaleString('tr-TR')}] ${msg.author.tag}${msg.author.bot ? ' [BOT]' : ''}:\n`;
        if (msg.content) {
            txt += `  ${msg.content}\n`;
        }
        if (msg.attachments.size > 0) {
            for (const att of msg.attachments.values()) {
                txt += `  [Ek Dosya] ${att.name}: ${att.url}\n`;
            }
        }
        if (msg.embeds.length > 0) {
            for (const emb of msg.embeds) {
                txt += `  [Embed] ${emb.title || ''} - ${emb.description || ''}\n`;
            }
        }
        txt += `\n`;
    }
    txt += `==================================================\n`;
    txt += `Rapor Sonu. Slesy Premium Ticket Logger.\n`;
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
                    await saveGuildTickets(t.guildId);

                    const stats = dbData.staffStats[userId] || { claimedCount: 0, closedCount: 0, ratings: [] };
                    stats.claimedCount++;
                    dbData.staffStats[userId] = stats;
                    await saveGuildTickets(t.guildId);

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
                    await saveGuildTickets(t.guildId);

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
                    await saveGuildTickets(t.guildId);

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
                        await saveGuildTickets(t.guildId);

                        if (t.claimedBy) {
                            const stats = dbData.staffStats[t.claimedBy] || { claimedCount: 0, closedCount: 0, ratings: [] };
                            stats.ratings.push(rating);
                            dbData.staffStats[t.claimedBy] = stats;
                            await saveGuildTickets(t.guildId);
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
