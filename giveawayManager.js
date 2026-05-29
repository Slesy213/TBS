const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const { supabase, updateSettings } = require('./db.js');

let giveaways = [];
const activeTimers = new Map();
const captchaSessions = new Map(); // userId -> { answer: number, giveawayId: string }

async function loadFromSettings() {
    giveaways.length = 0;
    try {
        const { data, error } = await supabase
            .from('giveaways')
            .select('*');

        if (error) {
            console.error('❌ Supabase çekilişleri yüklenirken hata oluştu:', error.message);
        } else if (data) {
            const mappedGiveaways = data.map(g => ({
                messageId: g.message_id,
                channelId: g.channel_id,
                guildId: g.guild_id,
                hostId: g.host_id,
                reward: g.reward,
                winnersCount: g.winners_count,
                ended: g.ended,
                endAt: Number(g.end_at),
                sureText: g.sure_text,
                participants: Array.isArray(g.participants) ? g.participants : [],
                winners: Array.isArray(g.winners) ? g.winners : [],
                requirements: g.requirements || {},
                bonusRoles: g.bonus_roles || {},
                bypassRoles: Array.isArray(g.bypass_roles) ? g.bypass_roles : [],
                customization: g.customization || {},
                useCaptcha: g.use_captcha,
                claimed: g.claimed || {}
            }));
            giveaways.push(...mappedGiveaways);
        }
    } catch (err) {
        console.error('❌ Supabase çekilişleri yükleme hatası:', err);
    }
    console.log(`[GIVEAWAY DEBUG] Hafızaya ${giveaways.length} aktif çekiliş yüklendi.`);
}

async function saveGuildGiveaways(guildId) {
    if (!guildId) return;
    try {
        const guildGiveaways = giveaways.filter(g => g.guildId === guildId && g.messageId);
        
        const rows = guildGiveaways.map(g => ({
            message_id: g.messageId,
            channel_id: g.channelId,
            guild_id: g.guildId,
            host_id: g.hostId,
            reward: g.reward,
            winners_count: g.winnersCount,
            ended: g.ended,
            end_at: g.endAt,
            sure_text: g.sureText,
            participants: g.participants,
            winners: g.winners,
            requirements: g.requirements,
            bonus_roles: g.bonusRoles,
            bypass_roles: g.bypassRoles,
            customization: g.customization,
            use_captcha: g.useCaptcha,
            claimed: g.claimed
        }));

        if (rows.length > 0) {
            const { error } = await supabase
                .from('giveaways')
                .upsert(rows, { onConflict: 'message_id' });
            if (error) {
                console.error(`❌ Supabase çekiliş toplu upsert hatası:`, error.message);
            }
        }

        await updateSettings(guildId, {
            guard_settings: {
                ...global.guardSettings.get(guildId),
                giveaways: undefined
            }
        });

        const gs = global.guardSettings.get(guildId) || {};
        delete gs.giveaways;
        global.guardSettings.set(guildId, gs);
    } catch (e) {
        console.error(`❌ Supabase çekiliş güncelleme hatası (Guild: ${guildId}):`, e);
    }
}

// ─── HELPER: PARSE TIME FORMAT (s, m, h, d) ───
function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// ─── HELPER: GENERATE GIVEAWAY EMBED ───
function generateGiveawayEmbed(giveaway) {
    const endTimestamp = Math.floor(giveaway.endAt / 1000);
    const relativeTime = `<t:${endTimestamp}:R>`;
    const exactTime = `<t:${endTimestamp}:F>`;

    const embed = new EmbedBuilder()
        .setColor(giveaway.customization?.color || '#FFD700')
        .setTitle(`🎉 Çekiliş: ${giveaway.reward}`)
        .setTimestamp(new Date(giveaway.endAt));

    const descriptionParts = [];
    if (giveaway.description) {
        descriptionParts.push(`📝 **Açıklama:** ${giveaway.description}\n`);
    }

    descriptionParts.push(`🎁 **Ödül:** \`${giveaway.reward}\``);
    descriptionParts.push(`🏆 **Kazanan Sayısı:** \`${giveaway.winnersCount} Kişi\``);
    descriptionParts.push(`👤 **Sponsor/Host:** <@${giveaway.hostId}>`);
    descriptionParts.push(`⏰ **Bitiş Süresi:** ${relativeTime} (${exactTime})`);
    descriptionParts.push(`🎟️ **Katılımcı Sayısı:** \`${giveaway.participants.length}\``);

    // Requirements Display
    const reqs = [];
    const requirements = giveaway.requirements || {};
    if (requirements.requiredRoles && requirements.requiredRoles.length > 0) {
        const roleModeText = requirements.roleMode === 'AND' ? 'tümüne' : 'en az birine';
        const rolesList = requirements.requiredRoles.map(rid => `<@&${rid}>`).join(', ');
        reqs.push(`• **Gerekli Rol(ler):** ${rolesList} (Bu rollerin ${roleModeText} sahip olmalısınız)`);
    }
    if (requirements.blacklistRoleId) {
        reqs.push(`• **Yasaklı Rol:** <@&${requirements.blacklistRoleId}> (Bu role sahip üyeler katılamaz)`);
    }
    if (requirements.minAccountAge > 0) {
        reqs.push(`• **Hesap Yaş Sınırı:** En az \`${requirements.minAccountAge} Günlük\` hesap`);
    }
    if (requirements.minServerAge > 0) {
        reqs.push(`• **Sunucu Katılım Süresi:** En az \`${requirements.minServerAge} Gündür\` sunucuda bulunma`);
    }
    if (requirements.partnerServerId && requirements.partnerServerLink) {
        reqs.push(`• **Ortak Sunucu Şartı:** [Buraya Tıklayarak Katılın](${requirements.partnerServerLink})`);
    }
    if (giveaway.maxParticipants > 0) {
        reqs.push(`• **Maksimum Katılımcı Sınırı:** İlk \`${giveaway.maxParticipants}\` kişi katılamaz`);
    }
    if (giveaway.useCaptcha) {
        reqs.push(`• **Güvenlik Doğrulaması:** Katılmak için robot doğrulaması gerekir.`);
    }

    if (reqs.length > 0) {
        descriptionParts.push('\n🔒 **KATILIM ŞARTLARI**');
        descriptionParts.push(reqs.join('\n'));
    }

    // Bonus Entries Display
    const bonusRoles = giveaway.bonusRoles || {};
    if (Object.keys(bonusRoles).length > 0) {
        const bonusList = Object.entries(bonusRoles).map(([rid, mult]) => `<@&${rid}> ➔ **${mult}x Şans**`).join('\n');
        descriptionParts.push('\n⭐ **BONUS ŞANS ELDE EDEN ROLLER**');
        descriptionParts.push(bonusList);
    }

    embed.setDescription(descriptionParts.join('\n'));

    if (giveaway.customization?.banner) {
        embed.setImage(giveaway.customization.banner);
    }
    if (giveaway.customization?.thumbnail) {
        embed.setThumbnail(giveaway.customization.thumbnail);
    }

    embed.setFooter({ text: `Çekiliş ID: ${giveaway.messageId} | Slesy Çekiliş Sistemi` });

    return embed;
}

// ─── HELPER: GENERATE GIVEAWAY BUTTONS ───
function generateGiveawayButtons(giveaway) {
    const btnLabel = giveaway.customization?.buttonLabel || 'Katıl';
    const btnEmoji = giveaway.customization?.buttonEmoji || '🎟️';

    const joinButton = new ButtonBuilder()
        .setCustomId(`cekilis_join_${giveaway.messageId}`)
        .setLabel(btnLabel)
        .setStyle(ButtonStyle.Success);
    if (btnEmoji) joinButton.setEmoji(btnEmoji);

    const leaveButton = new ButtonBuilder()
        .setCustomId(`cekilis_leave_${giveaway.messageId}`)
        .setLabel('Ayrıl')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚪');

    const infoButton = new ButtonBuilder()
        .setCustomId(`cekilis_info_${giveaway.messageId}`)
        .setLabel('Şartları Gör')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('ℹ️');

    return new ActionRowBuilder().addComponents(joinButton, leaveButton, infoButton);
}

// ─── CHECK REQUIREMENTS FOR USER ───
async function checkRequirements(member, giveaway) {
    const userId = member.user.id;
    const guild = member.guild;

    // 1. Bypass Roles
    const bypassRoles = giveaway.bypassRoles || [];
    const hasBypass = bypassRoles.some(rid => member.roles.cache.has(rid));
    if (hasBypass) return { allowed: true };

    // 2. Blacklisted Roles
    const blacklistRoleId = giveaway.requirements?.blacklistRoleId;
    if (blacklistRoleId && member.roles.cache.has(blacklistRoleId)) {
        return { allowed: false, reason: 'Yasaklı bir role sahip olduğunuz için katılamazsınız.' };
    }

    // 3. Guild Blacklist check
    const guildSettings = global.guardSettings.get(guild.id) || {};
    const blacklist = guildSettings.giveawayBlacklist || [];
    if (blacklist.includes(userId)) {
        return { allowed: false, reason: 'Sunucu genelinde çekilişlerden kara listeye alınmışsınız.' };
    }

    // 4. Required Roles
    const requiredRoles = giveaway.requirements?.requiredRoles || [];
    const roleMode = giveaway.requirements?.roleMode || 'OR';
    if (requiredRoles.length > 0) {
        const hasRoles = requiredRoles.map(rid => member.roles.cache.has(rid));
        if (roleMode === 'AND' && hasRoles.includes(false)) {
            const roleNames = requiredRoles.map(rid => guild.roles.cache.get(rid)?.name || 'Bilinmeyen Rol').join(', ');
            return { allowed: false, reason: `Bu çekilişe katılmak için **şu rollerin tümüne** sahip olmalısınız: \`${roleNames}\`` };
        }
        if (roleMode === 'OR' && !hasRoles.includes(true)) {
            const roleNames = requiredRoles.map(rid => guild.roles.cache.get(rid)?.name || 'Bilinmeyen Rol').join(', ');
            return { allowed: false, reason: `Bu çekilişe katılmak için **şu rollerden en az birine** sahip olmalısınız: \`${roleNames}\`` };
        }
    }

    // 5. Account Age
    const minAccountAge = giveaway.requirements?.minAccountAge || 0;
    if (minAccountAge > 0) {
        const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (ageDays < minAccountAge) {
            return { allowed: false, reason: `Hesabınız en az **${minAccountAge} günlük** olmalıdır. (Mevcut: **${Math.floor(ageDays)} günlük**)` };
        }
    }

    // 6. Server Join Age
    const minServerAge = giveaway.requirements?.minServerAge || 0;
    if (minServerAge > 0) {
        const joinDays = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
        if (joinDays < minServerAge) {
            return { allowed: false, reason: `Sunucuya en az **${minServerAge} gün önce** katılmış olmalısınız. (Mevcut: **${Math.floor(joinDays)} gündür buradasınız**)` };
        }
    }

    // 7. Partner Server Check
    const partnerServerId = giveaway.requirements?.partnerServerId;
    if (partnerServerId) {
        const partnerGuild = member.client.guilds.cache.get(partnerServerId);
        if (!partnerGuild) {
            return { allowed: false, reason: 'Çekiliş botunun ortak sunucuda üyeliği doğrulayamadı. Lütfen yöneticiye bildirin.' };
        }
        const partnerMember = await partnerGuild.members.fetch(userId).catch(() => null);
        if (!partnerMember) {
            return { allowed: false, reason: `Bu çekilişe katılmak için ortak sunucuya katılmalısınız:\n👉 ${giveaway.requirements.partnerServerLink}` };
        }
    }

    // 8. Max Participant Limit
    if (giveaway.maxParticipants > 0 && giveaway.participants.length >= giveaway.maxParticipants) {
        return { allowed: false, reason: `Çekiliş katılım sınırı (\`${giveaway.maxParticipants} kişi\`) doldu!` };
    }

    return { allowed: true };
}

// ─── LOG EVENT TO CHANNEL ───
async function logGiveawayEvent(guild, eventTitle, description) {
    const guardSettings = global.guardSettings.get(guild.id) || {};
    const logChId = guardSettings.logChannelId;
    if (!logChId) return;
    const logCh = guild.channels.cache.get(logChId);
    if (!logCh) return;

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎉 Slesy Çekiliş | ${eventTitle}`)
        .setDescription(description)
        .setTimestamp();

    await logCh.send({ embeds: [embed] }).catch(() => {});
}

// ─── ACTUALLY END GIVEAWAY AND PICK WINNERS ───
async function endGiveaway(client, giveawayId) {
    const giveaway = giveaways.find(g => g.messageId === giveawayId);
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;
    await saveGuildGiveaways(giveaway.guildId);

    const timer = activeTimers.get(giveawayId);
    if (timer) clearTimeout(timer);
    activeTimers.delete(giveawayId);

    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(giveawayId).catch(() => null);
    if (!message) return;

    // Pick Winners
    const participants = giveaway.participants || [];
    if (participants.length === 0) {
        const embedEmpty = EmbedBuilder.from(message.embeds[0])
            .setColor('#ED4245')
            .setDescription(`❌ **Çekiliş Sonuçlandı!**\n\nKatılan kimse olmadığı için çekiliş iptal edildi.`);
        await message.edit({ embeds: [embedEmpty], components: [] }).catch(() => {});
        await logGiveawayEvent(guild, 'Çekiliş İptal Edildi', `🎁 **Ödül:** ${giveaway.reward}\nID: \`${giveaway.messageId}\`\nSebep: Katılan kimse olmadı.`);
        return;
    }

    // Weighted selection pool based on bonus roles
    const selectionPool = [];
    for (const pId of participants) {
        const member = await guild.members.fetch(pId).catch(() => null);
        if (!member) continue;
        let weight = 1;
        const bonusRoles = giveaway.bonusRoles || {};
        for (const [rid, mult] of Object.entries(bonusRoles)) {
            if (member.roles.cache.has(rid)) {
                weight = Math.max(weight, parseInt(mult) || 1);
            }
        }
        for (let i = 0; i < weight; i++) {
            selectionPool.push(pId);
        }
    }

    const winnerIds = [];
    const winnersToPick = Math.min(giveaway.winnersCount, participants.length);

    while (winnerIds.length < winnersToPick && selectionPool.length > 0) {
        const index = Math.floor(Math.random() * selectionPool.length);
        const selectedId = selectionPool[index];
        if (!winnerIds.includes(selectedId)) {
            winnerIds.push(selectedId);
        }
        // Remove all entries of this winner from selection pool
        for (let i = selectionPool.length - 1; i >= 0; i--) {
            if (selectionPool[i] === selectedId) {
                selectionPool.splice(i, 1);
            }
        }
    }

    giveaway.winners = winnerIds;
    await saveGuildGiveaways(giveaway.guildId);

    const winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');

    // 1. Edit Announcement message
    const embedEnded = EmbedBuilder.from(message.embeds[0])
        .setColor('#57F287')
        .setDescription(`🏆 **Çekiliş Sonuçlandı!**\n\n🎁 **Ödül:** \`${giveaway.reward}\`\n👤 **Sponsor/Host:** <@${giveaway.hostId}>\n🏆 **Kazananlar:** ${winnerMentions || 'Çekilemedi'}\n🎟️ **Toplam Katılım:** \`${participants.length}\``);

    // If Claim Prize is enabled, add a button for winners to claim
    let finalRow = [];
    const claimDuration = giveaway.customization?.claimDuration || 0;
    if (claimDuration > 0 && winnerIds.length > 0) {
        const claimButton = new ButtonBuilder()
            .setCustomId(`cekilis_claim_${giveaway.messageId}`)
            .setLabel('Ödülü Al 🏆')
            .setStyle(ButtonStyle.Primary);
        finalRow = [new ActionRowBuilder().addComponents(claimButton)];
    }

    await message.edit({ embeds: [embedEnded], components: finalRow }).catch(() => {});

    // 2. Send Winner announcement message
    const customText = giveaway.customization?.winnersText || 'Tebrikler! 🎉';
    const announceMsg = await channel.send({
        content: `🎉 **Çekiliş Bitti!**\n🏆 **Ödül:** \`${giveaway.reward}\`\n👉 **Kazananlar:** ${winnerMentions}\n${customText}`
    }).catch(() => null);

    // 3. Assign Role automatically if configured
    const winRole = giveaway.customization?.winnerRole;
    if (winRole) {
        const role = guild.roles.cache.get(winRole);
        if (role) {
            for (const wid of winnerIds) {
                const member = await guild.members.fetch(wid).catch(() => null);
                if (member) await member.roles.add(role).catch(() => {});
            }
        }
    }

    // 4. DM Winners
    for (const wid of winnerIds) {
        const member = await guild.members.fetch(wid).catch(() => null);
        if (member) {
            const dmEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🎉 Çekiliş Kazandınız!')
                .setDescription(`Tebrikler! **${guild.name}** sunucusunda yapılan çekilişi kazandınız!\n\n🎁 **Ödül:** \`${giveaway.reward}\`\n🔗 [Çekiliş Mesajı Linki](${message.url})`)
                .setTimestamp();
            if (claimDuration > 0) {
                const claimLimit = Math.floor((Date.now() + (claimDuration * 60 * 60 * 1000)) / 1000);
                dmEmbed.addFields({ name: '⚠️ Önemli', value: `Ödülü alabilmek için çekiliş mesajındaki butona tıklamalısınız. Süreniz: <t:${claimLimit}:R>` });
            }
            await member.send({ embeds: [dmEmbed] }).catch(() => {});
        }
    }

    // 5. DM Host
    const host = await guild.members.fetch(giveaway.hostId).catch(() => null);
    if (host) {
        await host.send({
            content: `📢 **Çekilişiniz Sonuçlandı!**\n🎁 **Ödül:** \`${giveaway.reward}\`\n🏆 **Kazanan(lar):** ${winnerMentions}\n🔗 [Çekilişe Git](${message.url})`
        }).catch(() => {});
    }

    // 6. Log event
    await logGiveawayEvent(guild, 'Çekiliş Sonuçlandı', `🎁 **Ödül:** ${giveaway.reward}\nID: \`${giveaway.messageId}\`\n🏆 **Kazananlar:** ${winnerMentions}\nTotal Katılımcı: \`${participants.length}\``);

    // 7. Auto Reroll Unclaimed Setup
    if (claimDuration > 0) {
        const timeout = claimDuration * 60 * 60 * 1000;
        const claimTimer = setTimeout(async () => {
            // Check who claimed
            const currentG = giveaways.find(g => g.messageId === giveawayId);
            if (!currentG) return;
            const unclaimedWinners = currentG.winners.filter(wid => !currentG.claimed?.[wid]);
            if (unclaimedWinners.length > 0) {
                await channel.send({ content: `⚠️ **Süre Doldu!** Çekilişte ödülünü almayan kazananlar var. Yeniden çekiliş yapılıyor...` });
                await rerollGiveaway(client, guild.id, giveawayId, unclaimedWinners.length);
            }
        }, timeout);
        activeTimers.set(`claim_${giveawayId}`, claimTimer);
    }
}

// ─── START A GIVEAWAY ───
async function startGiveaway(client, data) {
    giveaways.push(data);
    await saveGuildGiveaways(data.guildId);

    const duration = parseTime(data.sureText);
    const endAt = Date.now() + duration;
    data.endAt = endAt;
    await saveGuildGiveaways(data.guildId);

    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) return null;

    const channel = guild.channels.cache.get(data.channelId);
    if (!channel) return null;

    const embed = generateGiveawayEmbed(data);
    const buttons = generateGiveawayButtons(data);

    const message = await channel.send({ embeds: [embed], components: [buttons] });
    data.messageId = message.id;
    await saveGuildGiveaways(data.guildId);

    // Re-render embed with final message ID inside footer
    const finalEmbed = generateGiveawayEmbed(data);
    const finalButtons = generateGiveawayButtons(data);
    await message.edit({ embeds: [finalEmbed], components: [finalButtons] }).catch(() => {});

    // Set end timer
    const timer = setTimeout(async () => {
        await endGiveaway(client, message.id);
    }, duration);
    activeTimers.set(message.id, timer);

    await logGiveawayEvent(guild, 'Çekiliş Başlatıldı', `🎁 **Ödül:** ${data.reward}\nID: \`${message.id}\`\nSüre: \`${data.sureText}\`\nKazanan Sayısı: \`${data.winnersCount}\``);

    return message.id;
}

// ─── CANCEL A GIVEAWAY ───
async function cancelGiveaway(client, guildId, messageId) {
    const giveawayIndex = giveaways.findIndex(g => g.messageId === messageId && g.guildId === guildId);
    if (giveawayIndex === -1) return { success: false, reason: 'Çekiliş bulunamadı.' };

    const giveaway = giveaways[giveawayIndex];
    
    // Stop Timers
    const timer = activeTimers.get(messageId);
    if (timer) clearTimeout(timer);
    activeTimers.delete(messageId);

    const claimTimer = activeTimers.get(`claim_${messageId}`);
    if (claimTimer) clearTimeout(claimTimer);
    activeTimers.delete(`claim_${messageId}`);

    // Update Announcement Message
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const channel = guild.channels.cache.get(giveaway.channelId);
        if (channel) {
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                const embedCanceled = EmbedBuilder.from(message.embeds[0])
                    .setColor('#ED4245')
                    .setDescription(`❌ **Çekiliş İptal Edildi!**\n\nBu çekiliş yetkililer tarafından iptal edilmiştir.`);
                await message.edit({ embeds: [embedCanceled], components: [] }).catch(() => {});
            }
        }
        await logGiveawayEvent(guild, 'Çekiliş İptal Edildi', `🎁 **Ödül:** ${giveaway.reward}\nID: \`${giveaway.messageId}\`\nYetkili tarafından iptal edildi.`);
    }

    giveaways.splice(giveawayIndex, 1);
    await saveGuildGiveaways(guildId);

    return { success: true };
}

// ─── FORCE END A GIVEAWAY ───
async function forceEndGiveaway(client, guildId, messageId) {
    const giveaway = giveaways.find(g => g.messageId === messageId && g.guildId === guildId);
    if (!giveaway) return { success: false, reason: 'Çekiliş bulunamadı.' };
    if (giveaway.ended) return { success: false, reason: 'Bu çekiliş zaten sonuçlanmış.' };

    await endGiveaway(client, messageId);
    return { success: true };
}

// ─── REROLL WINNERS ───
async function rerollGiveaway(client, guildId, messageId, count = 1) {
    const giveaway = giveaways.find(g => g.messageId === messageId && g.guildId === guildId);
    if (!giveaway) return { success: false, reason: 'Çekiliş bulunamadı.' };
    if (!giveaway.ended) return { success: false, reason: 'Bu çekiliş henüz sonuçlanmamış. Önce sonlandırın.' };

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { success: false, reason: 'Sunucu bulunamadı.' };

    const channel = guild.channels.cache.get(giveaway.channelId);
    if (!channel) return { success: false, reason: 'Kanal bulunamadı.' };

    const participants = giveaway.participants || [];
    if (participants.length === 0) {
        return { success: false, reason: 'Çekilişe katılan kimse olmadığı için reroll yapılamaz.' };
    }

    // Pick new winner(s)
    const selectionPool = [];
    for (const pId of participants) {
        const member = await guild.members.fetch(pId).catch(() => null);
        if (!member) continue;
        let weight = 1;
        const bonusRoles = giveaway.bonusRoles || {};
        for (const [rid, mult] of Object.entries(bonusRoles)) {
            if (member.roles.cache.has(rid)) {
                weight = Math.max(weight, parseInt(mult) || 1);
            }
        }
        for (let i = 0; i < weight; i++) {
            selectionPool.push(pId);
        }
    }

    const newWinnerIds = [];
    const winnersToPick = Math.min(count, participants.length);

    while (newWinnerIds.length < winnersToPick && selectionPool.length > 0) {
        const index = Math.floor(Math.random() * selectionPool.length);
        const selectedId = selectionPool[index];
        if (!newWinnerIds.includes(selectedId)) {
            newWinnerIds.push(selectedId);
        }
        for (let i = selectionPool.length - 1; i >= 0; i--) {
            if (selectionPool[i] === selectedId) {
                selectionPool.splice(i, 1);
            }
        }
    }

    if (newWinnerIds.length === 0) {
        return { success: false, reason: 'Yeni kazanan seçilemedi.' };
    }

    // Update database record for winners list
    giveaway.winners = [...(giveaway.winners || []), ...newWinnerIds];
    await saveGuildGiveaways(guildId);

    const mentions = newWinnerIds.map(id => `<@${id}>`).join(', ');

    // Send reroll message
    await channel.send({
        content: `🎉 **Yeniden Çekiliş!**\n🎁 **Ödül:** \`${giveaway.reward}\`\n🏆 **Yeni Kazananlar:** ${mentions}\nTebrikler! 🎉`
    });

    // Auto winner role
    const winRole = giveaway.customization?.winnerRole;
    if (winRole) {
        const role = guild.roles.cache.get(winRole);
        if (role) {
            for (const wid of newWinnerIds) {
                const member = await guild.members.fetch(wid).catch(() => null);
                if (member) await member.roles.add(role).catch(() => {});
            }
        }
    }

    // DM Winners
    for (const wid of newWinnerIds) {
        const member = await guild.members.fetch(wid).catch(() => null);
        if (member) {
            const dmEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🎉 Yeniden Çekilişte Kazandınız!')
                .setDescription(`Tebrikler! **${guild.name}** sunucusundaki yedek/yeniden çekilen çekilişi kazandınız!\n\n🎁 **Ödül:** \`${giveaway.reward}\``)
                .setTimestamp();
            await member.send({ embeds: [dmEmbed] }).catch(() => {});
        }
    }

    await logGiveawayEvent(guild, 'Yeniden Çekiliş Yapıldı', `🎁 **Ödül:** ${giveaway.reward}\nID: \`${giveaway.messageId}\`\n🏆 **Yeni Kazananlar:** ${mentions}`);

    return { success: true, winners: newWinnerIds };
}

// ─── RESUME ACTIVE TIMERS ON STARTUP ───
function init(client) {
    const now = Date.now();
    for (const giveaway of giveaways) {
        if (giveaway.ended) continue;

        const timeLeft = giveaway.endAt - now;
        if (timeLeft <= 0) {
            // Ended while bot was offline
            endGiveaway(client, giveaway.messageId);
        } else {
            // Resume timer
            const timer = setTimeout(async () => {
                await endGiveaway(client, giveaway.messageId);
            }, timeLeft);
            activeTimers.set(giveaway.messageId, timer);
        }
    }

    // Periodic integrity check (every 5 minutes)
    setInterval(() => {
        const currNow = Date.now();
        for (const giveaway of giveaways) {
            if (!giveaway.ended && giveaway.endAt <= currNow) {
                endGiveaway(client, giveaway.messageId);
            }
        }
    }, 300000);

    // ─── INTERACTION LISTENER FOR BUTTONS ───
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const customId = interaction.customId;

        // 1. JOIN BUTTON
        if (customId.startsWith('cekilis_join_')) {
            const messageId = customId.replace('cekilis_join_', '');
            const giveaway = giveaways.find(g => g.messageId === messageId);
            if (!giveaway) {
                return interaction.reply({ content: '❌ Bu çekiliş kaydı veritabanında bulunamadı.', ephemeral: true });
            }
            if (giveaway.ended) {
                return interaction.reply({ content: '❌ Bu çekiliş zaten sonuçlanmış.', ephemeral: true });
            }

            const userId = interaction.user.id;
            if (giveaway.participants.includes(userId)) {
                return interaction.reply({ content: '⚠️ Zaten çekilişe katılmış durumdasınız!', ephemeral: true });
            }

            // Anti button spam rate limit
            const cooldownKey = `cooldown_${userId}_${messageId}`;
            if (captchaSessions.has(cooldownKey)) {
                return interaction.reply({ content: '⏳ Lütfen çok hızlı tıklamayın!', ephemeral: true });
            }
            captchaSessions.set(cooldownKey, true);
            setTimeout(() => captchaSessions.delete(cooldownKey), 2000);

            // Check requirements
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return interaction.reply({ content: '❌ Sunucu üye bilginiz doğrulanırken hata oluştu.', ephemeral: true });
            }

            const check = await checkRequirements(member, giveaway);
            if (!check.allowed) {
                return interaction.reply({ content: `❌ **Çekiliş şartlarını karşılamıyorsunuz:**\n${check.reason}`, ephemeral: true });
            }

            // Captcha Verification Flow
            if (giveaway.useCaptcha) {
                const num1 = Math.floor(Math.random() * 9) + 1;
                const num2 = Math.floor(Math.random() * 9) + 1;
                const answer = num1 + num2;

                const sessionKey = `${userId}_${messageId}`;
                captchaSessions.set(sessionKey, { answer, time: Date.now() });

                // Random choices including correct one
                const choices = [answer];
                while (choices.length < 3) {
                    const rand = Math.floor(Math.random() * 18) + 1;
                    if (!choices.includes(rand)) choices.push(rand);
                }
                choices.sort(() => Math.random() - 0.5);

                const rowCaptcha = new ActionRowBuilder().addComponents(
                    choices.map((val, idx) => 
                        new ButtonBuilder()
                            .setCustomId(`cekilis_captcha_${messageId}_${val}`)
                            .setLabel(val.toString())
                            .setStyle(ButtonStyle.Primary)
                    )
                );

                return interaction.reply({
                    content: `🤖 **Robot Doğrulaması:** Çekilişe katılabilmek için lütfen aşağıdaki matematik sorusunu doğru yanıtlayın:\n👉 **${num1} + ${num2} = ?**`,
                    components: [rowCaptcha],
                    ephemeral: true
                });
            }

            // Add participant
            giveaway.participants.push(userId);
            await saveGuildGiveaways(interaction.guild?.id);

            await interaction.reply({ content: '✅ **Çekilişe başarıyla katıldınız!** Bol şans dileriz. 🎟️', ephemeral: true });

            // Re-render embed to update participant count
            const channel = interaction.channel;
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                await message.edit({ embeds: [generateGiveawayEmbed(giveaway)] }).catch(() => {});
            }
        }

        // 2. CAPTCHA SUBMIT
        else if (customId.startsWith('cekilis_captcha_')) {
            // customId format: cekilis_captcha_messageId_chosenValue
            const parts = customId.split('_');
            const messageId = parts[2];
            const chosenValue = parseInt(parts[3]);
            const userId = interaction.user.id;

            const giveaway = giveaways.find(g => g.messageId === messageId);
            if (!giveaway || giveaway.ended) {
                return interaction.reply({ content: '❌ Çekiliş aktif değil veya bulunamadı.', ephemeral: true });
            }

            const sessionKey = `${userId}_${messageId}`;
            const session = captchaSessions.get(sessionKey);
            if (!session) {
                return interaction.update({ content: '❌ Doğrulama oturumu zaman aşımına uğramış. Lütfen butona tekrar basıp deneyin.', components: [] });
            }

            if (chosenValue === session.answer) {
                captchaSessions.delete(sessionKey);
                
                if (giveaway.participants.includes(userId)) {
                    return interaction.update({ content: '⚠️ Zaten çekilişe katılmış durumdasınız!', components: [] });
                }

                giveaway.participants.push(userId);
                await saveGuildGiveaways(interaction.guild?.id);

                await interaction.update({ content: '✅ **Doğrulama başarılı!** Çekilişe kaydınız yapıldı. 🎟️', components: [] });

                // Re-render embed to update participant count
                const channel = interaction.channel;
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    await message.edit({ embeds: [generateGiveawayEmbed(giveaway)] }).catch(() => {});
                }
            } else {
                captchaSessions.delete(sessionKey);
                await interaction.update({ content: '❌ **Yanlış cevap!** Robot doğrulaması başarısız oldu. Çekilişe katılmak için katılım butonuna tekrar basıp yeni soruyu çözmeyi deneyin.', components: [] });
            }
        }

        // 3. LEAVE BUTTON
        else if (customId.startsWith('cekilis_leave_')) {
            const messageId = customId.replace('cekilis_leave_', '');
            const giveaway = giveaways.find(g => g.messageId === messageId);
            if (!giveaway) {
                return interaction.reply({ content: '❌ Çekiliş bulunamadı.', ephemeral: true });
            }
            if (giveaway.ended) {
                return interaction.reply({ content: '❌ Bu çekiliş zaten bitmiş.', ephemeral: true });
            }

            const userId = interaction.user.id;
            if (!giveaway.participants.includes(userId)) {
                return interaction.reply({ content: '⚠️ Zaten bu çekilişte katılımcı değilsiniz.', ephemeral: true });
            }

            giveaway.participants = giveaway.participants.filter(id => id !== userId);
            await saveGuildGiveaways(interaction.guild?.id);

            await interaction.reply({ content: '🚪 **Çekiliş katılımından ayrıldınız.** Kaydınız silindi.', ephemeral: true });

            // Re-render embed
            const channel = interaction.channel;
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                await message.edit({ embeds: [generateGiveawayEmbed(giveaway)] }).catch(() => {});
            }
        }

        // 4. INFO BUTTON
        else if (customId.startsWith('cekilis_info_')) {
            const messageId = customId.replace('cekilis_info_', '');
            const giveaway = giveaways.find(g => g.messageId === messageId);
            if (!giveaway) {
                return interaction.reply({ content: '❌ Çekiliş bulunamadı.', ephemeral: true });
            }

            const requirements = giveaway.requirements || {};
            const details = [];

            if (requirements.requiredRoles && requirements.requiredRoles.length > 0) {
                const list = requirements.requiredRoles.map(rid => `<@&${rid}>`).join(', ');
                details.push(`• **Gerekli Rol(ler):** ${list}`);
            }
            if (requirements.blacklistRoleId) {
                details.push(`• **Yasaklı Rol:** <@&${requirements.blacklistRoleId}>`);
            }
            if (requirements.minAccountAge > 0) {
                details.push(`• **Hesap Yaş Sınırı:** En az \`${requirements.minAccountAge} Gün\``);
            }
            if (requirements.minServerAge > 0) {
                details.push(`• **Sunucu Yaş Sınırı:** En az \`${requirements.minServerAge} Gün\``);
            }
            if (requirements.partnerServerId && requirements.partnerServerLink) {
                details.push(`• **Ortak Sunucu:** [Katılmak için tıklayın](${requirements.partnerServerLink})`);
            }

            const isJoined = giveaway.participants.includes(interaction.user.id) ? '🟢 **Katıldınız**' : '🔴 **Katılmadınız**';

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('ℹ️ Çekiliş Katılım Bilgileri')
                .addFields(
                    { name: 'Durumunuz', value: isJoined, inline: true },
                    { name: 'Toplam Katılım', value: `\`${giveaway.participants.length} Üye\``, inline: true },
                    { name: 'Aranan Şartlar', value: details.join('\n') || 'Herhangi bir katılım şartı yok, herkes katılabilir!' }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 5. CLAIM PRIZE BUTTON
        else if (customId.startsWith('cekilis_claim_')) {
            const messageId = customId.replace('cekilis_claim_', '');
            const giveaway = giveaways.find(g => g.messageId === messageId);
            if (!giveaway) {
                return interaction.reply({ content: '❌ Çekiliş bulunamadı.', ephemeral: true });
            }

            const userId = interaction.user.id;
            if (!giveaway.winners.includes(userId)) {
                return interaction.reply({ content: '❌ Bu çekilişin kazananı siz değilsiniz!', ephemeral: true });
            }

            giveaway.claimed = giveaway.claimed || {};
            if (giveaway.claimed[userId]) {
                return interaction.reply({ content: '⚠️ Ödülü zaten teslim aldınız/onayladınız!', ephemeral: true });
            }

            giveaway.claimed[userId] = Date.now();
            await saveGuildGiveaways(interaction.guild?.id);

            await interaction.reply({ content: '🏆 **Ödülü başarıyla onayladınız/talep ettiniz!** Sponsor sizinle en kısa sürede iletişime geçecektir.', ephemeral: true });

            const channel = interaction.channel;
            await channel.send({ content: `✅ <@${userId}> ödülünü başarıyla talep etti! Sponsor: <@${giveaway.hostId}>` }).catch(() => {});
        }
    });
}

module.exports = {
    giveaways,
    init,
    startGiveaway,
    cancelGiveaway,
    forceEndGiveaway,
    rerollGiveaway,
    saveGuildGiveaways,
    loadFromSettings,
    parseTime,
    generateGiveawayEmbed,
    generateGiveawayButtons
};
