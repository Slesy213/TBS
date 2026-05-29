const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');

const { supabase, updateSettings } = require('./db.js');

let polls = [];
const activeTimers = new Map();
const captchaSessions = new Map(); // userId -> { answer: number, pollId: string, values: [number] }

async function loadFromSettings() {
    polls.length = 0;
    try {
        const { data, error } = await supabase
            .from('polls')
            .select('*');

        if (error) {
            console.error('❌ Supabase anketleri yüklenirken hata oluştu:', error.message);
        } else if (data) {
            const mappedPolls = data.map(p => ({
                messageId: p.message_id,
                channelId: p.channel_id,
                guildId: p.guild_id,
                hostId: p.creator_id,
                question: p.question,
                choices: Array.isArray(p.choices) ? p.choices : [],
                votes: p.votes || {},
                ended: p.ended,
                endAt: Number(p.end_at),
                sureText: p.sure_text,
                useCaptcha: p.use_captcha,
                customEmojis: p.customization?.customEmojis || [],
                minVoters: p.customization?.minVoters || 0,
                requirements: p.customization?.requirements || {},
                bypassRoles: p.customization?.bypassRoles || [],
                customization: {
                    color: p.customization?.color,
                    banner: p.customization?.banner,
                    thumbnail: p.customization?.thumbnail,
                    btnStyle: p.customization?.btnStyle,
                    multiChoice: p.customization?.multiChoice,
                    revealMode: p.customization?.revealMode,
                    winnerRole: p.customization?.winnerRole
                }
            }));
            polls.push(...mappedPolls);
        }
    } catch (err) {
        console.error('❌ Supabase anketleri yükleme hatası:', err);
    }
    console.log(`[POLL DEBUG] Hafızaya ${polls.length} aktif anket yüklendi.`);
}

async function saveGuildPolls(guildId) {
    if (!guildId) return;
    try {
        const guildPolls = polls.filter(p => p.guildId === guildId);
        
        for (const p of guildPolls) {
            if (!p.messageId) continue;
            const { error } = await supabase
                .from('polls')
                .upsert({
                    message_id: p.messageId,
                    channel_id: p.channelId,
                    guild_id: p.guildId,
                    creator_id: p.hostId,
                    question: p.question,
                    choices: p.choices,
                    votes: p.votes,
                    ended: p.ended,
                    end_at: p.endAt,
                    sure_text: p.sureText,
                    use_captcha: p.useCaptcha,
                    customization: {
                        ...p.customization,
                        customEmojis: p.customEmojis,
                        minVoters: p.minVoters,
                        requirements: p.requirements,
                        bypassRoles: p.bypassRoles
                    }
                }, { onConflict: 'message_id' });
            if (error) {
                console.error(`❌ Supabase anket upsert hatası (Message: ${p.messageId}):`, error.message);
            }
        }

        await updateSettings(guildId, {
            guard_settings: {
                ...global.guardSettings.get(guildId),
                polls: undefined
            }
        });

        const gs = global.guardSettings.get(guildId) || {};
        delete gs.polls;
        global.guardSettings.set(guildId, gs);
    } catch (e) {
        console.error(`❌ Supabase anket güncelleme hatası (Guild: ${guildId}):`, e);
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

// ─── HELPER: GENERATE PROGRESS BAR ───
function generateProgressBar(percentage, size = 10) {
    const progress = Math.round(size * (percentage / 100));
    const emptyProgress = size - progress;
    return `\`[${'█'.repeat(progress)}${'░'.repeat(emptyProgress)}]\``;
}

// ─── HELPER: CALCULATE POLL RESULTS ───
function calculateResults(poll) {
    const totalVotesMap = {};
    poll.choices.forEach((_, idx) => totalVotesMap[idx] = 0);

    let totalVotersCount = 0;
    Object.values(poll.votes).forEach(voteVal => {
        totalVotersCount++;
        if (Array.isArray(voteVal)) {
            voteVal.forEach(idx => {
                if (totalVotesMap[idx] !== undefined) totalVotesMap[idx]++;
            });
        } else {
            if (totalVotesMap[voteVal] !== undefined) totalVotesMap[voteVal]++;
        }
    });

    // Sum of all choice points
    const sumVotes = Object.values(totalVotesMap).reduce((a, b) => a + b, 0);

    const choicesBreakdown = poll.choices.map((choiceText, idx) => {
        const count = totalVotesMap[idx] || 0;
        const percentage = sumVotes > 0 ? Math.round((count / sumVotes) * 100) : 0;
        return {
            index: idx,
            text: choiceText,
            count,
            percentage,
            emoji: poll.customEmojis?.[idx] || null
        };
    });

    return {
        totalVotersCount,
        sumVotes,
        choicesBreakdown
    };
}

// ─── HELPER: GENERATE POLL EMBED ───
function generatePollEmbed(poll, revealNow = false) {
    const endTimestamp = Math.floor(poll.endAt / 1000);
    const relativeTime = `<t:${endTimestamp}:R>`;
    const exactTime = `<t:${endTimestamp}:F>`;

    const embed = new EmbedBuilder()
        .setColor(poll.customization?.color || '#3498DB')
        .setTitle(`📊 Anket: ${poll.question}`)
        .setTimestamp(new Date(poll.endAt));

    const descriptionParts = [];
    descriptionParts.push(`❓ **Soru:** \`${poll.question}\``);
    descriptionParts.push(`👤 **Başlatan:** <@${poll.hostId}>`);
    descriptionParts.push(`⏰ **Bitiş Süresi:** ${relativeTime} (${exactTime})`);
    
    const results = calculateResults(poll);
    descriptionParts.push(`🎟️ **Oy Kullanan Üye Sayısı:** \`${results.totalVotersCount}\``);

    const hideResults = poll.customization?.revealMode && !poll.ended && !revealNow;

    descriptionParts.push('\n📋 **SEÇENEKLER & DURUM**');
    if (hideResults) {
        descriptionParts.push('*Seçeneklerin güncel oy oranları anket sona erdiğinde gösterilecektir.*');
        poll.choices.forEach((choice, idx) => {
            const emoji = poll.customEmojis?.[idx] ? `${poll.customEmojis[idx]} ` : '';
            descriptionParts.push(`**${idx + 1}.** ${emoji}${choice}`);
        });
    } else {
        // Highlight winners in finished poll
        let maxPct = -1;
        if (poll.ended) {
            maxPct = Math.max(...results.choicesBreakdown.map(c => c.count));
        }

        results.choicesBreakdown.forEach((item) => {
            const emoji = item.emoji ? `${item.emoji} ` : '';
            const progress = generateProgressBar(item.percentage);
            
            const isWinner = poll.ended && item.count === maxPct && item.count > 0;
            const optionText = isWinner ? `🏆 **${item.text}**` : item.text;
            
            descriptionParts.push(`**${item.index + 1}.** ${emoji}${optionText}\n` +
                `➔ ${progress} \`%${item.percentage}\` (\`${item.count} Oy\`)`);
        });
    }

    // Requirements Display
    const reqs = [];
    const requirements = poll.requirements || {};
    if (requirements.requiredRoles && requirements.requiredRoles.length > 0) {
        const roleModeText = requirements.roleMode === 'AND' ? 'tümüne' : 'en az birine';
        const rolesList = requirements.requiredRoles.map(rid => `<@&${rid}>`).join(', ');
        reqs.push(`• **Gerekli Rol(ler):** ${rolesList} (${roleModeText} sahip olmalısınız)`);
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
    if (poll.minVoters > 0) {
        reqs.push(`• **Asgari Katılım Sınırı:** En az \`${poll.minVoters} Oy\` toplanmalıdır`);
    }
    if (poll.useCaptcha) {
        reqs.push(`• **Robot Doğrulaması:** Oy kullanmak için robot doğrulaması gerekir.`);
    }

    if (reqs.length > 0) {
        descriptionParts.push('\n🔒 **OY KULLANMA ŞARTLARI**');
        descriptionParts.push(reqs.join('\n'));
    }

    embed.setDescription(descriptionParts.join('\n'));

    if (poll.customization?.banner) {
        embed.setImage(poll.customization.banner);
    }
    if (poll.customization?.thumbnail) {
        embed.setThumbnail(poll.customization.thumbnail);
    }

    embed.setFooter({ text: `Anket ID: ${poll.messageId} | Slesy Anket Sistemi` });

    return embed;
}

// ─── HELPER: GENERATE POLL BUTTONS/SELECT MENUS ───
function generatePollComponents(poll) {
    const isMulti = poll.customization?.multiChoice || false;
    const btnStyleName = poll.customization?.btnStyle || 'Primary';
    
    let btnStyle = ButtonStyle.Primary;
    if (btnStyleName === 'Secondary') btnStyle = ButtonStyle.Secondary;
    if (btnStyleName === 'Success') btnStyle = ButtonStyle.Success;
    if (btnStyleName === 'Danger') btnStyle = ButtonStyle.Danger;

    // Use Dropdown if options exceed 5
    if (poll.choices.length > 5) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`poll_vote_menu_${poll.messageId}`)
            .setPlaceholder('📊 Oyunuzu seçmek için buraya tıklayın')
            .setMinValues(1)
            .setMaxValues(isMulti ? poll.choices.length : 1);

        poll.choices.forEach((choice, idx) => {
            const emoji = poll.customEmojis?.[idx] || null;
            const opt = {
                label: `${idx + 1}. ${choice.substring(0, 80)}`,
                value: idx.toString()
            };
            if (emoji) opt.emoji = emoji;
            selectMenu.addOptions(opt);
        });

        // Add a button to revoke vote
        const revokeButton = new ButtonBuilder()
            .setCustomId(`poll_revoke_${poll.messageId}`)
            .setLabel('Oyunuzu Çekin / Temizleyin')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️');

        const infoButton = new ButtonBuilder()
            .setCustomId(`poll_info_${poll.messageId}`)
            .setLabel('Şartları Gör')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('ℹ️');

        return [
            new ActionRowBuilder().addComponents(selectMenu),
            new ActionRowBuilder().addComponents(revokeButton, infoButton)
        ];
    } else {
        // Multi choice uses select dropdown, single choice < 5 uses buttons
        if (isMulti) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`poll_vote_menu_${poll.messageId}`)
                .setPlaceholder('📊 Oyunuzu seçmek için buraya tıklayın (Çoklu Seçim)')
                .setMinValues(1)
                .setMaxValues(poll.choices.length);

            poll.choices.forEach((choice, idx) => {
                const emoji = poll.customEmojis?.[idx] || null;
                const opt = {
                    label: `${idx + 1}. ${choice.substring(0, 80)}`,
                    value: idx.toString()
                };
                if (emoji) opt.emoji = emoji;
                selectMenu.addOptions(opt);
            });

            const revokeButton = new ButtonBuilder()
                .setCustomId(`poll_revoke_${poll.messageId}`)
                .setLabel('Oyunuzu Temizleyin')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️');

            const infoButton = new ButtonBuilder()
                .setCustomId(`poll_info_${poll.messageId}`)
                .setLabel('Şartları Gör')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('ℹ️');

            return [
                new ActionRowBuilder().addComponents(selectMenu),
                new ActionRowBuilder().addComponents(revokeButton, infoButton)
            ];
        } else {
            // Standard single choice buttons
            const rows = [];
            let currentRow = new ActionRowBuilder();

            poll.choices.forEach((choice, idx) => {
                if (idx > 0 && idx % 4 === 0) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                const btn = new ButtonBuilder()
                    .setCustomId(`poll_vote_btn_${poll.messageId}_${idx}`)
                    .setLabel((idx + 1).toString())
                    .setStyle(btnStyle);
                
                const emoji = poll.customEmojis?.[idx] || null;
                if (emoji) btn.setEmoji(emoji);
                currentRow.addComponents(btn);
            });

            const extraRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`poll_revoke_${poll.messageId}`).setLabel('Geri Al 🚪').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`poll_info_${poll.messageId}`).setLabel('Şartlar ℹ️').setStyle(ButtonStyle.Secondary)
            );

            rows.push(currentRow);
            rows.push(extraRow);
            return rows;
        }
    }
}

// ─── CHECK REQUIREMENTS FOR USER ───
async function checkRequirements(member, poll) {
    const userId = member.user.id;
    const guild = member.guild;

    // 1. Bypass Roles
    const bypassRoles = poll.bypassRoles || [];
    const hasBypass = bypassRoles.some(rid => member.roles.cache.has(rid));
    if (hasBypass) return { allowed: true };

    // 2. Blacklisted Roles
    const blacklistRoleId = poll.requirements?.blacklistRoleId;
    if (blacklistRoleId && member.roles.cache.has(blacklistRoleId)) {
        return { allowed: false, reason: 'Yasaklı bir role sahip olduğunuz için oy kullanamazsınız.' };
    }

    // 3. Guild Blacklist check (uses guard settings blacklist)
    const guardSettings = global.guardSettings.get(guild.id) || {};
    const blacklist = guardSettings.giveawayBlacklist || []; // share blacklist
    if (blacklist.includes(userId)) {
        return { allowed: false, reason: 'Sunucu genelinde anketlerden kara listeye alınmışsınız.' };
    }

    // 4. Required Roles
    const requiredRoles = poll.requirements?.requiredRoles || [];
    const roleMode = poll.requirements?.roleMode || 'OR';
    if (requiredRoles.length > 0) {
        const hasRoles = requiredRoles.map(rid => member.roles.cache.has(rid));
        if (roleMode === 'AND' && hasRoles.includes(false)) {
            const roleNames = requiredRoles.map(rid => guild.roles.cache.get(rid)?.name || 'Bilinmeyen Rol').join(', ');
            return { allowed: false, reason: `Oy kullanmak için **şu rollerin tümüne** sahip olmalısınız: \`${roleNames}\`` };
        }
        if (roleMode === 'OR' && !hasRoles.includes(true)) {
            const roleNames = requiredRoles.map(rid => guild.roles.cache.get(rid)?.name || 'Bilinmeyen Rol').join(', ');
            return { allowed: false, reason: `Oy kullanmak için **şu rollerden en az birine** sahip olmalısınız: \`${roleNames}\`` };
        }
    }

    // 5. Account Age
    const minAccountAge = poll.requirements?.minAccountAge || 0;
    if (minAccountAge > 0) {
        const ageDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (ageDays < minAccountAge) {
            return { allowed: false, reason: `Hesabınız en az **${minAccountAge} günlük** olmalıdır. (Mevcut: **${Math.floor(ageDays)} günlük**)` };
        }
    }

    // 6. Server Join Age
    const minServerAge = poll.requirements?.minServerAge || 0;
    if (minServerAge > 0) {
        const joinDays = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
        if (joinDays < minServerAge) {
            return { allowed: false, reason: `Sunucuya en az **${minServerAge} gün önce** katılmış olmalısınız. (Mevcut: **${Math.floor(joinDays)} gündür buradasınız**)` };
        }
    }

    return { allowed: true };
}

// ─── LOG EVENT TO CHANNEL ───
async function logPollEvent(guild, eventTitle, description) {
    const guardSettings = global.guardSettings.get(guild.id) || {};
    const logChId = guardSettings.logChannelId;
    if (!logChId) return;
    const logCh = guild.channels.cache.get(logChId);
    if (!logCh) return;

    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`📊 Slesy Anket | ${eventTitle}`)
        .setDescription(description)
        .setTimestamp();

    await logCh.send({ embeds: [embed] }).catch(() => {});
}

// ─── ACTUALLY END POLL AND PICK WINNER ───
async function endPoll(client, pollId) {
    const poll = polls.find(p => p.messageId === pollId);
    if (!poll || poll.ended) return;

    poll.ended = true;
    await saveGuildPolls(poll.guildId);

    const timer = activeTimers.get(pollId);
    if (timer) clearTimeout(timer);
    activeTimers.delete(pollId);

    const guild = client.guilds.cache.get(poll.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(poll.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(pollId).catch(() => null);
    if (!message) return;

    const results = calculateResults(poll);

    // Check minimum voters requirement
    if (poll.minVoters > 0 && results.totalVotersCount < poll.minVoters) {
        const embedFailed = EmbedBuilder.from(message.embeds[0])
            .setColor('#ED4245')
            .setDescription(`❌ **Anket Başarısız Oldu!**\n\nKatılım sayısı asgari sınırı (\`${poll.minVoters} oy\`) karşılamadığı için anket geçersiz sayıldı. Toplam oy: \`${results.totalVotersCount}\``);
        await message.edit({ embeds: [embedFailed], components: [] }).catch(() => {});
        await logPollEvent(guild, 'Anket Başarısız Oldu', `❓ **Soru:** ${poll.question}\nID: \`${poll.messageId}\`\nSebep: Asgari oy sınırına ulaşılamadı (${results.totalVotersCount}/${poll.minVoters})`);
        return;
    }

    // Determine Winner(s)
    let winnersText = 'Sonuç Beraberlik';
    if (results.totalVotersCount > 0) {
        const maxVotes = Math.max(...results.choicesBreakdown.map(c => c.count));
        const winners = results.choicesBreakdown.filter(c => c.count === maxVotes && c.count > 0);
        if (winners.length > 0) {
            winnersText = winners.map(w => `**${w.text}** (%${w.percentage} - ${w.count} Oy)`).join('\n');
            
            // Assign winner role to participants who voted for the winner
            const winRole = poll.customization?.winnerRole;
            if (winRole) {
                const role = guild.roles.cache.get(winRole);
                if (role) {
                    const winnerIndices = winners.map(w => w.index);
                    for (const [uid, voteVal] of Object.entries(poll.votes)) {
                        const matches = Array.isArray(voteVal) ? voteVal.some(idx => winnerIndices.includes(idx)) : winnerIndices.includes(voteVal);
                        if (matches) {
                            const member = await guild.members.fetch(uid).catch(() => null);
                            if (member) await member.roles.add(role).catch(() => {});
                        }
                    }
                }
            }
        }
    }

    // Edit Announcement message
    const embedEnded = generatePollEmbed(poll, true)
        .setColor('#57F287')
        .setTitle(`📊 Anket Sonuçlandı: ${poll.question}`);

    await message.edit({ embeds: [embedEnded], components: [] }).catch(() => {});

    // Send summary announcement message
    await channel.send({
        content: `🎉 **Anket Sona Erdi!**\n❓ **Soru:** \`${poll.question}\`\n🏆 **Kazanan Seçenek(ler):**\n${winnersText}\nToplam kullanılan oy: \`${results.totalVotersCount}\``
    }).catch(() => {});

    // DM Host
    const host = await guild.members.fetch(poll.hostId).catch(() => null);
    if (host) {
        await host.send({
            content: `📢 **Anketiniz Sonuçlandı!**\n❓ **Soru:** \`${poll.question}\`\n🏆 **Sonuçlar:**\n${winnersText}\n🔗 [Ankete Git](${message.url})`
        }).catch(() => {});
    }

    // Log event
    await logPollEvent(guild, 'Anket Sonuçlandı', `❓ **Soru:** ${poll.question}\nID: \`${poll.messageId}\`\nToplam oy: \`${results.totalVotersCount}\``);
}

// ─── START A POLL ───
async function startPoll(client, data) {
    polls.push(data);
    await saveGuildPolls(data.guildId);

    const duration = parseTime(data.sureText);
    const endAt = Date.now() + duration;
    data.endAt = endAt;
    await saveGuildPolls(data.guildId);

    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) return null;

    const channel = guild.channels.cache.get(data.channelId);
    if (!channel) return null;

    const embed = generatePollEmbed(data);
    const components = generatePollComponents(data);

    const message = await channel.send({ embeds: [embed], components });
    data.messageId = message.id;
    await saveGuildPolls(data.guildId);

    // Re-render embed with final message ID inside footer
    const finalEmbed = generatePollEmbed(data);
    const finalComponents = generatePollComponents(data);
    await message.edit({ embeds: [finalEmbed], components: finalComponents }).catch(() => {});

    // Set end timer
    const timer = setTimeout(async () => {
        await endPoll(client, message.id);
    }, duration);
    activeTimers.set(message.id, timer);

    await logPollEvent(guild, 'Anket Başlatıldı', `❓ **Soru:** ${data.question}\nID: \`${message.id}\`\nSüre: \`${data.sureText}\``);

    return message.id;
}

// ─── CANCEL A POLL ───
async function cancelPoll(client, guildId, messageId) {
    const pollIndex = polls.findIndex(p => p.messageId === messageId && p.guildId === guildId);
    if (pollIndex === -1) return { success: false, reason: 'Anket bulunamadı.' };

    const poll = polls[pollIndex];
    
    // Stop Timers
    const timer = activeTimers.get(messageId);
    if (timer) clearTimeout(timer);
    activeTimers.delete(messageId);

    // Update Message
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const channel = guild.channels.cache.get(poll.channelId);
        if (channel) {
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                const embedCanceled = EmbedBuilder.from(message.embeds[0])
                    .setColor('#ED4245')
                    .setDescription(`❌ **Anket İptal Edildi!**\n\nBu anket yetkililer tarafından iptal edilmiştir.`);
                await message.edit({ embeds: [embedCanceled], components: [] }).catch(() => {});
            }
        }
        await logPollEvent(guild, 'Anket İptal Edildi', `❓ **Soru:** ${poll.question}\nID: \`${poll.messageId}\`\nYetkili tarafından iptal edildi.`);
    }

    polls.splice(pollIndex, 1);
    await saveGuildPolls(guildId);

    return { success: true };
}

// ─── FORCE END A POLL ───
async function forceEndPoll(client, guildId, messageId) {
    const poll = polls.find(p => p.messageId === messageId && p.guildId === guildId);
    if (!poll) return { success: false, reason: 'Anket bulunamadı.' };
    if (poll.ended) return { success: false, reason: 'Bu anket zaten sonuçlanmış.' };

    await endPoll(client, messageId);
    return { success: true };
}

// ─── EXTEND POLL DURATION ───
async function extendPoll(client, guildId, messageId, extraTimeStr) {
    const poll = polls.find(p => p.messageId === messageId && p.guildId === guildId);
    if (!poll) return { success: false, reason: 'Anket bulunamadı.' };
    if (poll.ended) return { success: false, reason: 'Bu anket sona ermiş. Süresi uzatılamaz.' };

    const extraMs = parseTime(extraTimeStr);
    if (!extraMs) return { success: false, reason: 'Geçersiz süre formatı.' };

    poll.endAt += extraMs;
    await saveGuildPolls(guildId);

    // Reset timer
    const timer = activeTimers.get(messageId);
    if (timer) clearTimeout(timer);

    const timeLeft = poll.endAt - Date.now();
    const newTimer = setTimeout(async () => {
        await endPoll(client, messageId);
    }, timeLeft);
    activeTimers.set(messageId, newTimer);

    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const channel = guild.channels.cache.get(poll.channelId);
        if (channel) {
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (message) {
                await message.edit({ embeds: [generatePollEmbed(poll)] }).catch(() => {});
            }
        }
        await logPollEvent(guild, 'Anket Süresi Uzatıldı', `❓ **Soru:** ${poll.question}\nID: \`${poll.messageId}\`\nEklenen süre: \`${extraTimeStr}\``);
    }

    return { success: true };
}

// ─── RESUME ACTIVE TIMERS ON STARTUP ───
function init(client) {
    const now = Date.now();
    for (const poll of polls) {
        if (poll.ended) continue;

        const timeLeft = poll.endAt - now;
        if (timeLeft <= 0) {
            endPoll(client, poll.messageId);
        } else {
            const timer = setTimeout(async () => {
                await endPoll(client, poll.messageId);
            }, timeLeft);
            activeTimers.set(poll.messageId, timer);
        }
    }

    // Periodic integrity check
    setInterval(() => {
        const currNow = Date.now();
        for (const poll of polls) {
            if (!poll.ended && poll.endAt <= currNow) {
                endPoll(client, poll.messageId);
            }
        }
    }, 300000);

    // ─── INTERACTION LISTENER FOR BUTTONS & MENUS ───
    client.on('interactionCreate', async (interaction) => {
        const guildId = interaction.guild?.id;
        if (!guildId) return;

        const userId = interaction.user.id;
        const customId = interaction.customId;

        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        // 1. BUTTON VOTE
        if (interaction.isButton() && customId.startsWith('poll_vote_btn_')) {
            // customId format: poll_vote_btn_messageId_optionIdx
            const parts = customId.split('_');
            const messageId = parts[3];
            const optionIdx = parseInt(parts[4]);

            const poll = polls.find(p => p.messageId === messageId);
            if (!poll) return interaction.reply({ content: '❌ Anket veritabanında bulunamadı.', ephemeral: true });
            if (poll.ended) return interaction.reply({ content: '❌ Bu anket sona ermiş.', ephemeral: true });

            // Cooldown protection
            const cooldownKey = `cooldown_${userId}_${messageId}`;
            if (captchaSessions.has(cooldownKey)) {
                return interaction.reply({ content: '⏳ Lütfen çok hızlı tıklamayın!', ephemeral: true });
            }
            captchaSessions.set(cooldownKey, true);
            setTimeout(() => captchaSessions.delete(cooldownKey), 1500);

            // Requirements Check
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) return interaction.reply({ content: '❌ Sunucu üye bilginiz doğrulanamadı.', ephemeral: true });

            const check = await checkRequirements(member, poll);
            if (!check.allowed) {
                return interaction.reply({ content: `❌ **Oy kullanma şartlarını karşılamıyorsunuz:**\n${check.reason}`, ephemeral: true });
            }

            // Captcha Verification Flow
            if (poll.useCaptcha) {
                const num1 = Math.floor(Math.random() * 9) + 1;
                const num2 = Math.floor(Math.random() * 9) + 1;
                const answer = num1 + num2;

                const sessionKey = `${userId}_${messageId}`;
                captchaSessions.set(sessionKey, { answer, time: Date.now(), values: [optionIdx] });

                const choices = [answer];
                while (choices.length < 3) {
                    const rand = Math.floor(Math.random() * 18) + 1;
                    if (!choices.includes(rand)) choices.push(rand);
                }
                choices.sort(() => Math.random() - 0.5);

                const rowCaptcha = new ActionRowBuilder().addComponents(
                    choices.map(val => 
                        new ButtonBuilder()
                            .setCustomId(`poll_captcha_${messageId}_${val}`)
                            .setLabel(val.toString())
                            .setStyle(ButtonStyle.Primary)
                    )
                );

                return interaction.reply({
                    content: `🤖 **Robot Doğrulaması:** Oy kullanabilmek için lütfen aşağıdaki matematik sorusunu doğru yanıtlayın:\n👉 **${num1} + ${num2} = ?**`,
                    components: [rowCaptcha],
                    ephemeral: true
                });
            }

            // Record vote
            const oldVote = poll.votes[userId];
            poll.votes[userId] = optionIdx;
            await saveGuildPolls(guildId);

            const choiceName = poll.choices[optionIdx];
            await interaction.reply({ content: `✅ **Oyunuz başarıyla kaydedildi!** Tercihiniz: **${choiceName}**`, ephemeral: true });

            // DM Receipt
            await member.send({ content: `📊 **Anket Oy Makbuzu:**\n**Sunucu:** ${interaction.guild.name}\n**Soru:** ${poll.question}\n**Oyunuz:** ${choiceName}` }).catch(() => {});

            // Update Embed (if not Reveal on End mode)
            if (!poll.customization?.revealMode) {
                const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (message) await message.edit({ embeds: [generatePollEmbed(poll)] }).catch(() => {});
            }
        }

        // 2. DROPDOWN SELECT VOTE
        else if (interaction.isStringSelectMenu() && customId.startsWith('poll_vote_menu_')) {
            const messageId = customId.replace('poll_vote_menu_', '');
            const poll = polls.find(p => p.messageId === messageId);
            if (!poll) return interaction.reply({ content: '❌ Anket veritabanında bulunamadı.', ephemeral: true });
            if (poll.ended) return interaction.reply({ content: '❌ Bu anket sona ermiş.', ephemeral: true });

            // Cooldown protection
            const cooldownKey = `cooldown_${userId}_${messageId}`;
            if (captchaSessions.has(cooldownKey)) {
                return interaction.reply({ content: '⏳ Lütfen çok hızlı tıklamayın!', ephemeral: true });
            }
            captchaSessions.set(cooldownKey, true);
            setTimeout(() => captchaSessions.delete(cooldownKey), 1500);

            // Requirements Check
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) return interaction.reply({ content: '❌ Sunucu üye bilginiz doğrulanamadı.', ephemeral: true });

            const check = await checkRequirements(member, poll);
            if (!check.allowed) {
                return interaction.reply({ content: `❌ **Oy kullanma şartlarını karşılamıyorsunuz:**\n${check.reason}`, ephemeral: true });
            }

            const chosenIndices = interaction.values.map(v => parseInt(v));

            // Captcha Verification Flow
            if (poll.useCaptcha) {
                const num1 = Math.floor(Math.random() * 9) + 1;
                const num2 = Math.floor(Math.random() * 9) + 1;
                const answer = num1 + num2;

                const sessionKey = `${userId}_${messageId}`;
                captchaSessions.set(sessionKey, { answer, time: Date.now(), values: chosenIndices });

                const choices = [answer];
                while (choices.length < 3) {
                    const rand = Math.floor(Math.random() * 18) + 1;
                    if (!choices.includes(rand)) choices.push(rand);
                }
                choices.sort(() => Math.random() - 0.5);

                const rowCaptcha = new ActionRowBuilder().addComponents(
                    choices.map(val => 
                        new ButtonBuilder()
                            .setCustomId(`poll_captcha_${messageId}_${val}`)
                            .setLabel(val.toString())
                            .setStyle(ButtonStyle.Primary)
                    )
                );

                return interaction.reply({
                    content: `🤖 **Robot Doğrulaması:** Oy kullanabilmek için lütfen aşağıdaki matematik sorusunu doğru yanıtlayın:\n👉 **${num1} + ${num2} = ?**`,
                    components: [rowCaptcha],
                    ephemeral: true
                });
            }

            // Record vote
            const isMulti = poll.customization?.multiChoice || false;
            poll.votes[userId] = isMulti ? chosenIndices : chosenIndices[0];
            await saveGuildPolls(guildId);

            const choicesNames = chosenIndices.map(idx => poll.choices[idx]).join(', ');
            await interaction.reply({ content: `✅ **Oyunuz başarıyla kaydedildi!** Tercihiniz: **${choicesNames}**`, ephemeral: true });

            // DM Receipt
            await member.send({ content: `📊 **Anket Oy Makbuzu:**\n**Sunucu:** ${interaction.guild.name}\n**Soru:** ${poll.question}\n**Oyunuz:** ${choicesNames}` }).catch(() => {});

            // Update Embed (if not Reveal on End mode)
            if (!poll.customization?.revealMode) {
                const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (message) await message.edit({ embeds: [generatePollEmbed(poll)] }).catch(() => {});
            }
        }

        // 3. CAPTCHA COMPLETED FOR POLL
        else if (interaction.isButton() && customId.startsWith('poll_captcha_')) {
            const parts = customId.split('_');
            const messageId = parts[2];
            const chosenValue = parseInt(parts[3]);

            const poll = polls.find(p => p.messageId === messageId);
            if (!poll || poll.ended) return interaction.reply({ content: '❌ Anket aktif değil veya bulunamadı.', ephemeral: true });

            const sessionKey = `${userId}_${messageId}`;
            const session = captchaSessions.get(sessionKey);
            if (!session) {
                return interaction.update({ content: '❌ Doğrulama oturumu zaman aşımına uğramış. Lütfen butona tekrar basıp deneyin.', components: [] });
            }

            if (chosenValue === session.answer) {
                captchaSessions.delete(sessionKey);

                const isMulti = poll.customization?.multiChoice || false;
                poll.votes[userId] = isMulti ? session.values : session.values[0];
                await saveGuildPolls(guildId);

                const choicesNames = session.values.map(idx => poll.choices[idx]).join(', ');
                await interaction.update({ content: `✅ **Doğrulama başarılı!** Oyunuz başarıyla kaydedildi: **${choicesNames}**`, components: [] });

                // DM Receipt
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.send({ content: `📊 **Anket Oy Makbuzu:**\n**Sunucu:** ${interaction.guild.name}\n**Soru:** ${poll.question}\n**Oyunuz:** ${choicesNames}` }).catch(() => {});
                }

                // Update Embed (if not Reveal on End mode)
                if (!poll.customization?.revealMode) {
                    const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
                    if (message) await message.edit({ embeds: [generatePollEmbed(poll)] }).catch(() => {});
                }
            } else {
                captchaSessions.delete(sessionKey);
                await interaction.update({ content: '❌ **Yanlış cevap!** Robot doğrulaması başarısız oldu. Oy kullanabilmek için lütfen tekrar seçim yapıp yeni soruyu çözmeyi deneyin.', components: [] });
            }
        }

        // 4. REVOKE VOTE
        else if (interaction.isButton() && customId.startsWith('poll_revoke_')) {
            const messageId = customId.replace('poll_revoke_', '');
            const poll = polls.find(p => p.messageId === messageId);
            if (!poll) return interaction.reply({ content: '❌ Anket bulunamadı.', ephemeral: true });
            if (poll.ended) return interaction.reply({ content: '❌ Bu anket sona ermiş.', ephemeral: true });

            if (poll.votes[userId] === undefined) {
                return interaction.reply({ content: '⚠️ Zaten bu ankette oy kullanmamışsınız.', ephemeral: true });
            }

            delete poll.votes[userId];
            await saveGuildPolls(guildId);

            await interaction.reply({ content: '🚪 **Oyunuz başarıyla geri çekildi!** Kaydınız silindi.', ephemeral: true });

            // Update Embed (if not Reveal on End mode)
            if (!poll.customization?.revealMode) {
                const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (message) await message.edit({ embeds: [generatePollEmbed(poll)] }).catch(() => {});
            }
        }

        // 5. INFO BUTTON
        else if (interaction.isButton() && customId.startsWith('poll_info_')) {
            const messageId = customId.replace('poll_info_', '');
            const poll = polls.find(p => p.messageId === messageId);
            if (!poll) return interaction.reply({ content: '❌ Anket bulunamadı.', ephemeral: true });

            const requirements = poll.requirements || {};
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
            if (poll.minVoters > 0) {
                details.push(`• **Asgari Oy Limiti:** En az \`${poll.minVoters} Oy\``);
            }

            const votedOption = poll.votes[userId] !== undefined ? '🟢 **Oy Kullandınız**' : '🔴 **Oy Kullanmadınız**';

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('ℹ️ Anket Oy Katılım Bilgileri')
                .addFields(
                    { name: 'Oy Durumunuz', value: votedOption, inline: true },
                    { name: 'Toplam Oy', value: `\`${Object.keys(poll.votes).length} Oy\``, inline: true },
                    { name: 'Aranan Şartlar', value: details.join('\n') || 'Herhangi bir oy kullanma şartı yok, herkes katılabilir!' }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    });
}

module.exports = {
    polls,
    init,
    startPoll,
    cancelPoll,
    forceEndPoll,
    extendPoll,
    saveGuildPolls,
    loadFromSettings,
    parseTime,
    generatePollEmbed,
    generatePollComponents
};
