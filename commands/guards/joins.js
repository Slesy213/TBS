const { AuditLogEvent, PermissionFlagsBits, EmbedBuilder, ChannelType } = require("discord.js");
const {
    isFeatureEnabled,
    getAuditLogEntry,
    punishAdmin,
    increaseThreat,
    getSetting,
    sendGuardLog,
    isWhitelisted
} = require("../guard.js");

// Yerel Bellekler (Raid ve Alt Hesap tespiti için önbellek)
const joinTracker = new Map(); // guildId -> [giris_zamanlari]
const altTracker = new Map();  // guildId -> [yeni_hesap_giris_zamanlari]
const avatarTracker = new Map(); // guildId -> [avatarsiz_giris_zamanlari]
const activeRaids = new Map(); // guildId -> timestamp of last raid trigger
const raidJoinsCache = new Map(); // guildId -> [{ time: timestamp, userId: string, tag: string, inviteCode: string, interval: number }]
const nameSimilarityHistory = new Map(); // guildId -> [usernames]
const inviteUsesCache = new Map(); // guildId -> Map(code -> uses)
const mathVerifications = new Map(); // userId -> { answer: number, guildId: string, timestamp: number }

function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= str2.length; j += 1) {
        for (let i = 1; i <= str1.length; i += 1) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    return track[str2.length][str1.length];
}

function areNamesSimilar(name1, name2) {
    if (!name1 || !name2) return false;
    const len = Math.max(name1.length, name2.length);
    if (len === 0) return false;
    const distance = levenshteinDistance(name1.toLowerCase(), name2.toLowerCase());
    const similarity = (len - distance) / len;
    if (similarity >= 0.85) return true;

    // Check shared prefix/suffix of length >= 4
    if (name1.length >= 4 && name2.length >= 4) {
        const prefix1 = name1.substring(0, 4).toLowerCase();
        const prefix2 = name2.substring(0, 4).toLowerCase();
        if (prefix1 === prefix2) return true;

        const suffix1 = name1.substring(name1.length - 4).toLowerCase();
        const suffix2 = name2.substring(name2.length - 4).toLowerCase();
        if (suffix1 === suffix2) return true;
    }

    return false;
}

async function trackInviteUsed(member) {
    const guildId = member.guild.id;
    const cache = inviteUsesCache.get(guildId) || new Map();
    const currentInvites = await member.guild.invites.fetch().catch(() => null);
    let usedCode = "bilinmeyen";
    if (currentInvites) {
        for (const [code, invite] of currentInvites.entries()) {
            const cachedUses = cache.get(code) || 0;
            if (invite.uses > cachedUses) {
                usedCode = code;
                break;
            }
        }
        const newCache = new Map();
        currentInvites.forEach(inv => newCache.set(inv.code, inv.uses));
        inviteUsesCache.set(guildId, newCache);
    }
    return usedCode;
}

module.exports = (client) => {
    // Helper to punish bot adding administrator
    async function handleBotExecutorPunishment(guild, executor, reason, guildId) {
        if (!executor) return;
        increaseThreat(guildId, 30, reason, guild);

        let punishAction = "İkaz & Loglandı";

        if (isFeatureEnabled(guildId, "antiBotActionBanAddExecutor")) {
            punishAction = "Sunucudan Yasaklandı";
            await punishAdmin(guild, executor, `Kritik İhlal: ${reason}`, guildId);
        } else if (isFeatureEnabled(guildId, "antiBotActionKickAddExecutor")) {
            punishAction = "Sunucudan Atıldı";
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member && executor.id !== guild.ownerId) {
                await sendGuardLog(guild, executor, null, reason, punishAction, guildId);
                await member.kick(`Guard | ${reason}`).catch(() => {});
            }
        } else {
            // Default legacy punishment (strips admin roles + bans)
            await punishAdmin(guild, executor, reason, guildId);
        }
    }

    async function handleRaidTrigger(guild, raidCache, triggerReason) {
        const guildId = guild.id;
        const now = Date.now();

        // 1. Extreme Threat Level (Feature 14)
        if (isFeatureEnabled(guildId, "raidExtremeThreatLevel")) {
            global.guildThreatLevels.set(guildId, 100);
        } else {
            increaseThreat(guildId, 40, "Anti-Raid Tetiklendi", guild);
        }

        // Initialize backup maps if they don't exist
        global.channelBackupPermissions = global.channelBackupPermissions || new Map();
        global.pausedInvitesCache = global.pausedInvitesCache || new Map();
        global.pausedVanityCache = global.pausedVanityCache || new Map();

        // Keep backup of roles/settings if auto backup is enabled (Feature 38 & 27/35)
        const textBackup = [];
        const voiceBackup = [];

        // 2. Lock down channels (Feature 10 & 11)
        const everyoneRole = guild.roles.everyone;
        
        if (isFeatureEnabled(guildId, "raidLockdownChannels")) {
            const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement);
            for (const [id, channel] of textChannels.entries()) {
                const currentOverwrites = channel.permissionOverwrites.cache.get(everyoneRole.id);
                // Save original overwrite
                textBackup.push({
                    channelId: id,
                    allow: currentOverwrites ? currentOverwrites.allow.bitfield.toString() : "0",
                    deny: currentOverwrites ? currentOverwrites.deny.bitfield.toString() : "0"
                });
                
                // Set SendMessages to false
                await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: false
                }, { reason: "Guard Anti-Raid | Kanal Kilitleme" }).catch(() => {});
            }
        }

        if (isFeatureEnabled(guildId, "raidLockdownVoice")) {
            const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice);
            for (const [id, channel] of voiceChannels.entries()) {
                const currentOverwrites = channel.permissionOverwrites.cache.get(everyoneRole.id);
                // Save original overwrite
                voiceBackup.push({
                    channelId: id,
                    allow: currentOverwrites ? currentOverwrites.allow.bitfield.toString() : "0",
                    deny: currentOverwrites ? currentOverwrites.deny.bitfield.toString() : "0"
                });

                // Set Connect to false
                await channel.permissionOverwrites.edit(everyoneRole, {
                    Connect: false
                }, { reason: "Guard Anti-Raid | Ses Kanalı Kilitleme" }).catch(() => {});
            }
        }

        if (textBackup.length > 0 || voiceBackup.length > 0) {
            global.channelBackupPermissions.set(guildId, { textBackup, voiceBackup });
        }

        // 3. Pause Invites (Feature 12)
        if (isFeatureEnabled(guildId, "raidPauseInvites")) {
            const invites = await guild.invites.fetch().catch(() => null);
            if (invites) {
                const guildInvitesBackup = [];
                for (const [code, invite] of invites.entries()) {
                    guildInvitesBackup.push({
                        code: invite.code,
                        channelId: invite.channelId,
                        maxAge: invite.maxAge,
                        maxUses: invite.maxUses,
                        temporary: invite.temporary,
                        unique: invite.unique,
                        uses: invite.uses,
                        inviterId: invite.inviter?.id
                    });
                    // Delete the invite code to temporarily deactivate it
                    await invite.delete("Guard Anti-Raid | Davetleri Duraklatma").catch(() => {});
                }
                global.pausedInvitesCache.set(guildId, guildInvitesBackup);
            }
        }

        // 4. Revert Vanity URL (Feature 13)
        if (isFeatureEnabled(guildId, "raidRevertVanity") && guild.vanityURLCode) {
            global.pausedVanityCache.set(guildId, guild.vanityURLCode);
            await guild.setVanityCode(null, "Guard Anti-Raid | Özel Davet Kaldırma").catch(() => {});
        }

        // 5. Disable Integrations (Feature 16)
        if (isFeatureEnabled(guildId, "raidDisableIntegrations")) {
            await guild.edit({
                widgetEnabled: false
            }, "Guard Anti-Raid | Widget Engelleme").catch(() => {});
        }

        // 6. Integrity Freeze (Feature 15)
        if (isFeatureEnabled(guildId, "raidIntegrityFreeze")) {
            global.integrityFreeze = global.integrityFreeze || new Map();
            global.integrityFreeze.set(guildId, true);
        }

        // 7. Alert Staff & Owner (Feature 29, 30, 31, 32)
        const logChId = getSetting(guildId, "logChannelId");
        const logChannel = guild.channels.cache.get(logChId);
        
        const staffPing = isFeatureEnabled(guildId, "raidAlertStaffPing") ? "@everyone" : "";
        
        const embedAlert = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle("🚨 ACİL DURUM: Sunucu Saldırı Altında!")
            .setDescription(`
**Saldırı Sebebi:** \`${triggerReason}\`
**Aktif Koruma Modları:** Sunucu kilitlendi (Lockdown). Kanallar kapatıldı, davet bağlantıları iptal edildi.
            `)
            .setTimestamp();

        if (logChannel) {
            await logChannel.send({ content: staffPing ? `${staffPing} **Giriş Saldırısı Algılandı!**` : null, embeds: [embedAlert] }).catch(() => {});
        }

        // Owner DM alert with Unlock Button (Feature 30)
        if (isFeatureEnabled(guildId, "raidAlertOwnerDM")) {
            const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
            if (owner) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
                const rowUnlock = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`owner_force_unlock_${guildId}`).setLabel("🔓 Sunucu Kilidini Aç").setStyle(ButtonStyle.Success)
                );
                
                const ownerEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🚨 Sunucunda Saldırı Algılandı: ${guild.name}`)
                    .setDescription(`
Sunucuna yönelik seri giriş saldırısı (Raid) algılandı ve otomatik önlemler alındı.
**Algılanan Neden:** \`${triggerReason}\`

Kilitleri manuel olarak açmak için aşağıdaki butona tıklayabilirsiniz.
                    `)
                    .setTimestamp();

                await owner.send({ embeds: [ownerEmbed], components: [rowUnlock] }).catch(() => {});
            }
        }

        // Public Announcement Notice (Feature 32)
        if (isFeatureEnabled(guildId, "raidPublicNotice")) {
            const systemCh = guild.systemChannel || guild.channels.cache.find(c => c.name.includes("duyuru") || c.name.includes("announcement") || c.name.includes("chat"));
            if (systemCh) {
                const publicEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle("🛡️ Sunucu Güvenlik Kilidi Aktif")
                    .setDescription("Sunucumuza yönelik olağandışı girişler tespit edildiğinden dolayı geçici olarak güvenlik kilidi (Lockdown) aktif edilmiştir. Kanallarda mesaj gönderimi geçici olarak kapatılmıştır. Güvenlik sağlandığında kilit otomatik olarak açılacaktır. Anlayışınız için teşekkür ederiz.")
                    .setTimestamp();
                await systemCh.send({ embeds: [publicEmbed] }).catch(() => {});
            }
        }

        // 8. Auto Unlock (Feature 35) & Auto Cleanup (Feature 34) timers setup
        if (isFeatureEnabled(guildId, "raidAutoUnlock")) {
            global.autoUnlockTimers = global.autoUnlockTimers || new Map();
            const existingTimer = global.autoUnlockTimers.get(guildId);
            if (existingTimer) clearTimeout(existingTimer);

            const timer = setTimeout(async () => {
                await restoreServerLockdown(guild);
            }, 30 * 60 * 1000);
            global.autoUnlockTimers.set(guildId, timer);
        }

        if (isFeatureEnabled(guildId, "raidAutoCleanup")) {
            global.autoCleanupTimers = global.autoCleanupTimers || new Map();
            const existingCleanup = global.autoCleanupTimers.get(guildId);
            if (existingCleanup) clearTimeout(existingCleanup);

            const timerCleanup = setTimeout(async () => {
                const raidJoins = raidJoinsCache.get(guildId) || [];
                const raidStartTime = activeRaids.get(guildId);
                if (raidStartTime && raidJoins.length > 0) {
                    const toClean = raidJoins.filter(item => item.time >= raidStartTime);
                    for (const userDetail of toClean) {
                        const m = await guild.members.fetch(userDetail.userId).catch(() => null);
                        if (m) {
                            if (isFeatureEnabled(guildId, "raidActionBan")) {
                                await m.ban({ reason: "Guard Anti-Raid | Otomatik Temizlik (Raid Katılımcısı)" }).catch(() => {});
                            } else {
                                await m.kick("Guard Anti-Raid | Otomatik Temizlik (Raid Katılımcısı)").catch(() => {});
                            }
                        }
                    }
                    if (logChannel) {
                        await logChannel.send({ content: `🧹 **Otomatik Temizlik Tamamlandı:** Saldırı penceresinde katılan \`${toClean.length}\` hesap sunucudan temizlendi.` }).catch(() => {});
                    }
                }
            }, 10 * 60 * 1000);
            global.autoCleanupTimers.set(guildId, timerCleanup);
        }
    }

    async function restoreServerLockdown(guild) {
        const guildId = guild.id;

        global.guildThreatLevels.set(guildId, 0);
        activeRaids.delete(guildId);
        global.integrityFreeze = global.integrityFreeze || new Map();
        global.integrityFreeze.delete(guildId);

        if (global.autoUnlockTimers) {
            const t = global.autoUnlockTimers.get(guildId);
            if (t) clearTimeout(t);
            global.autoUnlockTimers.delete(guildId);
        }
        if (global.autoCleanupTimers) {
            const tc = global.autoCleanupTimers.get(guildId);
            if (tc) clearTimeout(tc);
            global.autoCleanupTimers.delete(guildId);
        }

        if (global.channelBackupPermissions && global.channelBackupPermissions.has(guildId)) {
            const backup = global.channelBackupPermissions.get(guildId);
            const everyoneRole = guild.roles.everyone;

            if (backup.textBackup) {
                for (const item of backup.textBackup) {
                    const channel = guild.channels.cache.get(item.channelId);
                    if (channel) {
                        const allowBit = BigInt(item.allow);
                        const denyBit = BigInt(item.deny);
                        if (allowBit === 0n && denyBit === 0n) {
                            await channel.permissionOverwrites.delete(everyoneRole).catch(() => {});
                        } else {
                            await channel.permissionOverwrites.create(everyoneRole, {
                                SendMessages: allowBit & PermissionFlagsBits.SendMessages ? true : (denyBit & PermissionFlagsBits.SendMessages ? false : null)
                            }, { reason: "Guard Anti-Raid | Kilidi Kaldırma" }).catch(() => {});
                        }
                    }
                }
            }

            if (backup.voiceBackup) {
                for (const item of backup.voiceBackup) {
                    const channel = guild.channels.cache.get(item.channelId);
                    if (channel) {
                        const allowBit = BigInt(item.allow);
                        const denyBit = BigInt(item.deny);
                        if (allowBit === 0n && denyBit === 0n) {
                            await channel.permissionOverwrites.delete(everyoneRole).catch(() => {});
                        } else {
                            await channel.permissionOverwrites.create(everyoneRole, {
                                Connect: allowBit & PermissionFlagsBits.Connect ? true : (denyBit & PermissionFlagsBits.Connect ? false : null)
                            }, { reason: "Guard Anti-Raid | Kilidi Kaldırma" }).catch(() => {});
                        }
                    }
                }
            }
            global.channelBackupPermissions.delete(guildId);
        }

        if (global.pausedInvitesCache && global.pausedInvitesCache.has(guildId)) {
            const inviteBackup = global.pausedInvitesCache.get(guildId);
            for (const inv of inviteBackup) {
                const channel = guild.channels.cache.get(inv.channelId);
                if (channel) {
                    await channel.createInvite({
                        maxAge: inv.maxAge,
                        maxUses: inv.maxUses,
                        temporary: inv.temporary,
                        unique: inv.unique,
                        reason: "Guard Anti-Raid | Davetleri Geri Yükleme"
                    }).catch(() => {});
                }
            }
            global.pausedInvitesCache.delete(guildId);
        }

        if (global.pausedVanityCache && global.pausedVanityCache.has(guildId)) {
            const oldVanity = global.pausedVanityCache.get(guildId);
            await guild.setVanityCode(oldVanity, "Guard Anti-Raid | Özel Davet Geri Yükleme").catch(() => {});
            global.pausedVanityCache.delete(guildId);
        }

        if (isFeatureEnabled(guildId, "raidDisableIntegrations")) {
            await guild.edit({
                widgetEnabled: true
            }, "Guard Anti-Raid | Widget Geri Yükleme").catch(() => {});
        }

        const logChId = getSetting(guildId, "logChannelId");
        const logChannel = guild.channels.cache.get(logChId);
        if (logChannel) {
            const embedRestore = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("🔓 Sunucu Kilidi Kaldırıldı")
                .setDescription("Güvenlik kilidi (Lockdown) sona erdi. Tüm kanal yetkileri ve davet bağlantıları eski haline geri yüklenmiştir.")
                .setTimestamp();
            await logChannel.send({ embeds: [embedRestore] }).catch(() => {});
        }

        const systemCh = guild.systemChannel || guild.channels.cache.find(c => c.name.includes("duyuru") || c.name.includes("announcement") || c.name.includes("chat"));
        if (systemCh) {
            const publicEmbed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("🔓 Sunucu Kilidi Kaldırıldı")
                .setDescription("Güvenlik kilidi devre dışı bırakılmıştır. Sohbet kanalları tekrar kullanıma açılmıştır.")
                .setTimestamp();
            await systemCh.send({ embeds: [publicEmbed] }).catch(() => {});
        }
    }

    client.on("guildMemberAdd", async member => {
        if (!member.guild) return;
        const guildId = member.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        // ============================================
        // 1. ANTI-BOT OVERHAUL (20 FEATURES)
        // ============================================
        if (member.user.bot) {
            // Feature 4: antiBotLockdown (Immediate lockdown kick)
            if (isFeatureEnabled(guildId, "antiBotLockdown")) {
                await member.kick("Guard | Anti-Bot Lockdown Modu Aktif").catch(() => {});
                const entry = await getAuditLogEntry(member.guild, AuditLogEvent.BotAdd);
                if (entry) {
                    await handleBotExecutorPunishment(member.guild, entry.executor, "Lockdown Sırasında Bot Ekleme", guildId);
                }
                return;
            }

            const entry = await getAuditLogEntry(member.guild, AuditLogEvent.BotAdd);
            const executor = entry && entry.target && entry.target.id === member.id ? entry.executor : null;

            // Whitelist Bypass (Feature 16)
            const threatVal = global.guildThreatLevels.get(guildId) || 0;
            const autonomousBypass = isFeatureEnabled(guildId, "antiBotAutonomousBypass") && threatVal === 0;

            if (executor && isWhitelisted(member.guild, executor.id, "channel")) {
                if (!autonomousBypass) {
                    // Feature 2: antiBotLimitAdd (saatte maks 1 bot ekleme limiti)
                    if (isFeatureEnabled(guildId, "antiBotLimitAdd")) {
                        global.botAddTracker = global.botAddTracker || new Map();
                        const key = `${guildId}:${executor.id}`;
                        let lastAdds = global.botAddTracker.get(key) || [];
                        const now = Date.now();
                        lastAdds = lastAdds.filter(t => now - t < 3600000); // 1 hour
                        lastAdds.push(now);
                        global.botAddTracker.set(key, lastAdds);

                        if (lastAdds.length > 1) {
                            await member.kick("Guard | Bot Ekleme Hız Sınırı Aşıldı").catch(() => {});
                            await handleBotExecutorPunishment(member.guild, executor, "Bot Ekleme Limit Aşımı (Saatte >1 Bot)", guildId);
                            return;
                        }
                    }
                }
            } else if (isFeatureEnabled(guildId, "antiBotAdd")) {
                // Unauthorized Bot Add
                await member.kick("Guard | Yetkisiz Bot Ekleme").catch(() => {});
                if (executor) {
                    await handleBotExecutorPunishment(member.guild, executor, "İzinsiz Bot Ekleme", guildId);
                }
                return;
            }

            // Feature 12: antiBotCheckCreationDate (creation age under 15 days)
            if (isFeatureEnabled(guildId, "antiBotCheckCreationDate")) {
                const diffDays = Math.ceil((Date.now() - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 15) {
                    await member.kick("Guard | Yeni Oluşturulmuş Bot").catch(() => {});
                    if (executor) {
                        await sendGuardLog(member.guild, executor, member.user, `Bot Yaş Koruması (Bot ${diffDays} günlük)`, "Bot Atıldı", guildId);
                    }
                    return;
                }
            }

            // Feature 5: antiBotBlockUnverified (unverified bot badge block)
            if (isFeatureEnabled(guildId, "antiBotBlockUnverified")) {
                const isVerified = member.user.flags && (member.user.flags.has(1 << 16) || member.user.flags.has("VerifiedBot"));
                if (!isVerified) {
                    await member.kick("Guard | Doğrulanmamış Bot Koruması").catch(() => {});
                    if (executor) {
                        await sendGuardLog(member.guild, executor, member.user, "Doğrulanmamış Geliştirici Botu", "Bot Atıldı", guildId);
                    }
                    return;
                }
            }

            // Feature 13: antiBotBlockPublicBots (block public bots, allow custom bots only)
            if (isFeatureEnabled(guildId, "antiBotBlockPublicBots")) {
                const isPublic = member.user.flags && (member.user.flags.has(1 << 17) || member.user.flags.has("BotPublic"));
                if (isPublic) {
                    await member.kick("Guard | Genel Bot Koruması (Sadece Özel Bot İzni)").catch(() => {});
                    if (executor) {
                        await sendGuardLog(member.guild, executor, member.user, "Genel Davetli Bot Koruması", "Bot Atıldı", guildId);
                    }
                    return;
                }
            }

            // Feature 3: antiBotRequireVerify (require secondary staff approval)
            if (isFeatureEnabled(guildId, "antiBotRequireVerify")) {
                const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                if (quarantineRolId) {
                    await member.roles.set([quarantineRolId]).catch(() => {});
                }
                
                const logChId = getSetting(guildId, "logChannelId");
                const logChannel = member.guild.channels.cache.get(logChId);
                if (logChannel) {
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
                    const rowApprove = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`approve_bot_${member.id}`).setLabel("🟢 Onayla").setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`deny_bot_${member.id}`).setLabel("🔴 Reddet (At)").setStyle(ButtonStyle.Danger)
                    );
                    const embedVerify = new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle("🤖 Bot Onay Bekliyor")
                        .setDescription(`
Sunucuya yeni bir bot eklendi ve onay bekliyor:
**Bot:** ${member.user} (\`${member.user.tag}\` / \`${member.id}\`)
**Ekleyen Yetkili:** ${executor ? `<@${executor.id}>` : "Tespit Edilemedi"}
                        `)
                        .setTimestamp();
                    
                    const verifyMsg = await logChannel.send({ embeds: [embedVerify], components: [rowApprove] }).catch(() => null);
                    if (verifyMsg) {
                        global.pendingBotVerifications = global.pendingBotVerifications || new Map();
                        global.pendingBotVerifications.set(member.id, {
                            guildId,
                            botId: member.id,
                            messageId: verifyMsg.id,
                            channelId: logChannel.id,
                            executorId: executor ? executor.id : null
                        });
                    }
                }
            }

            // Feature 8: antiBotQuarantine
            if (isFeatureEnabled(guildId, "antiBotQuarantine") && !isFeatureEnabled(guildId, "antiBotRequireVerify")) {
                const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                if (quarantineRolId) {
                    await member.roles.set([quarantineRolId]).catch(() => {});
                    if (executor) {
                        await sendGuardLog(member.guild, executor, member.user, "Bot Otomatik Karantina", "Karantina Rolü Verildi", guildId);
                    }
                }
            }

            // Feature 6: antiBotLimitPermissions (strip Admin/Manage permissions from managed role)
            if (isFeatureEnabled(guildId, "antiBotLimitPermissions")) {
                for (const role of member.roles.cache.values()) {
                    if (role.managed) {
                        const newPermissions = role.permissions.remove(
                            PermissionFlagsBits.Administrator,
                            PermissionFlagsBits.ManageRoles,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.BanMembers,
                            PermissionFlagsBits.KickMembers,
                            PermissionFlagsBits.ManageWebhooks
                        );
                        await role.setPermissions(newPermissions, "Guard | Yetki Temizleme Modu").catch(() => {});
                    }
                }
            }

            // Feature 19: antiBotChannelRestriction (strip channel access overrides)
            if (isFeatureEnabled(guildId, "antiBotChannelRestriction")) {
                for (const role of member.roles.cache.values()) {
                    if (role.managed) {
                        member.guild.channels.cache.forEach(async (channel) => {
                            const isTestChannel = channel.name.includes("test") || channel.name.includes("bot") || channel.name.includes("log");
                            if (!isTestChannel) {
                                await channel.permissionOverwrites.create(role, {
                                    ViewChannel: false,
                                    SendMessages: false
                                }).catch(() => {});
                            }
                        });
                    }
                }
            }

            // Feature 11: antiBotLogAddedDetails
            if (isFeatureEnabled(guildId, "antiBotLogAddedDetails") && executor) {
                const logChId = getSetting(guildId, "logChannelId");
                const logCh = member.guild.channels.cache.get(logChId);
                if (logCh) {
                    const embedDetails = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle("🤖 Yeni Bot Kayıt Raporu")
                        .setDescription(`
**Bot:** ${member.user.tag} (\`${member.id}\`)
**Oluşturulma Tarihi:** \`${member.user.createdAt.toLocaleDateString("tr-TR")}\`
**Ekleyen Yetkili:** <@${executor.id}> (\`${executor.id}\`)
**Genel Bot mu?** \`${member.user.flags?.has("BotPublic") ? "Evet" : "Hayır"}\`
**Onaylı Bot mu?** \`${member.user.flags?.has("VerifiedBot") ? "Evet" : "Hayır"}\`
                        `)
                        .setTimestamp();
                    await logCh.send({ embeds: [embedDetails] }).catch(() => {});
                }
            }
            return;
        }

        // ============================================
        // 2. NORMAL MEMBER JOINS (YENİ HESAP 10 ÖZELLİK ENTEGRELİ)
        // ============================================
        increaseThreat(guildId, 6, "Üye Girişi", member.guild);

        const now = Date.now();
        const accountAgeMs = now - member.user.createdTimestamp;
        const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

        // Otonom Mod için Tehdit Çarpanı
        let threatMultiplier = 1;
        const currentThreat = global.guildThreatLevels.get(guildId) || 0;

        // 10. ÖZELLİK: Otonom Katı Mod
        if (isFeatureEnabled(guildId, "accountAgeAutoStrict") && currentThreat >= 35) {
            threatMultiplier = 2; // Saldırı anında sınırı 2 katına çıkarır
        }

        const baseLimit = getSetting(guildId, "accountAgeLimit") || 7;
        const limitDays = baseLimit * threatMultiplier;

        // --- YENİ HESAP KORUMASI ---
        if (isFeatureEnabled(guildId, "accountAgeBlockAll") && accountAgeDays < limitDays) {
            
            // 9. ÖZELLİK: Alt Hesap (Multi) Tespiti
            if (isFeatureEnabled(guildId, "accountAgeTrackAltAccounts")) {
                let alts = altTracker.get(guildId) || [];
                alts = alts.filter(t => now - t < 5 * 60 * 1000); // Sadece son 5 dakikayı tut
                alts.push(now);
                altTracker.set(guildId, alts);

                // 3'ten fazla yeni hesap art arda geliyorsa tehdit seviyesini artır!
                if (alts.length >= 3) {
                    increaseThreat(guildId, 15, "Ardışık Yeni (Alt) Hesap Girişi Tespiti", member.guild);
                }
            }

            // 8. ÖZELLİK: Özel Davet İzni (Bypass)
            // Eğer özel botlar veya vanity ile girmişse (geliştirilecek) bypass atılabilir.
            if (isFeatureEnabled(guildId, "accountAgeBypassInvites")) {
                // Şimdilik pasif (invite takip modülü eklenince entegre edilebilir)
            }

            let actionTaken = "İşlem Yok";
            let punished = false;

            // 7. ÖZELLİK: Kullanıcıya DM Bildirimi
            if (isFeatureEnabled(guildId, "accountAgeDMNotify")) {
                const dmEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("🛑 Giriş Reddedildi / Kısıtlandı")
                    .setDescription(`**${member.guild.name}** sunucusuna girişiniz güvenlik nedeniyle kısıtlandı.\n\n**Sebep:** Hesabınızın açılış tarihi (\`${Math.floor(accountAgeDays)} gün önce\`), sunucunun asgari güvenlik sınırının (\`${limitDays} gün\`) altındadır.`)
                    .setFooter({ text: "Slesy Global Security | Yeni Hesap Koruması" });
                
                await member.send({ embeds: [dmEmbed] }).catch(() => {});
            }

            // 3. ÖZELLİK: Sunucudan Yasakla (Ban)
            if (isFeatureEnabled(guildId, "accountAgeActionBan")) {
                await member.ban({ reason: `Slesy Guard - Yeni Hesap (Sınır: ${limitDays} Gün)` }).catch(() => {});
                actionTaken = "Sunucudan Yasaklandı (Ban)";
                punished = true;
            }
            // 2. ÖZELLİK: Sunucudan At (Kick)
            else if (isFeatureEnabled(guildId, "accountAgeActionKick") && !punished) {
                await member.kick(`Slesy Guard - Yeni Hesap (Sınır: ${limitDays} Gün)`).catch(() => {});
                actionTaken = "Sunucudan Atıldı (Kick)";
                punished = true;
            }
            
            // 4. ÖZELLİK: Karantinaya Al
            if (!punished && isFeatureEnabled(guildId, "accountAgeActionQuarantine")) {
                const quarantineRoleId = getSetting(guildId, "quarantineRoleId");
                if (quarantineRoleId) {
                    await member.roles.add(quarantineRoleId, "Yeni Hesap Karantinası").catch(() => {});
                    actionTaken = "Karantina Rolü Verildi";
                    punished = true;
                }
            }

            // 5. ÖZELLİK: Sustur (Timeout)
            if (!punished && isFeatureEnabled(guildId, "accountAgeActionTimeout")) {
                await member.timeout(60 * 60 * 1000, "Yeni Hesap Koruması - 1 Saat").catch(() => {});
                actionTaken = actionTaken === "İşlem Yok" ? "1 Saat Susturuldu" : actionTaken + " & Susturuldu";
                punished = true;
            }

            // 6. ÖZELLİK: Yetkili Log Bildirimi
            if (isFeatureEnabled(guildId, "accountAgeLogStaff") && punished) {
                sendGuardLog(member.guild, { id: "SYSTEM", tag: "Yeni Hesap Koruması" }, member.user, `Hesap Yaşı: **${Math.floor(accountAgeDays)} Gün**\nOtonom Sınır: **${limitDays} Gün**`, actionTaken, guildId);
            }

            // Ban veya Kick atıldıysa diğer kuralları kontrol etmeye gerek yok
            if (punished && (actionTaken.includes("Atıldı") || actionTaken.includes("Yasaklandı"))) {
                return; 
            }
        }

        // --- DİĞER GİRİŞ KORUMALARI ---
        
        // Varsayılan Avatar Koruması (10 Özellik)
        if (isFeatureEnabled(guildId, "defaultAvatarGuard") && !member.user.avatar) {
            
            // 8. ÖZELLİK: Güvenli Liste Muafiyeti (Bypass)
            let isBypassed = false;
            if (isFeatureEnabled(guildId, "defaultAvatarBypassWhitelisted")) {
                if (isWhitelisted(member.guild, member.id)) {
                    isBypassed = true;
                }
            }

            if (!isBypassed) {
                // 9. ÖZELLİK: Seri Giriş (Raid) Tespiti
                if (isFeatureEnabled(guildId, "defaultAvatarTrackSpam")) {
                    let tracker = avatarTracker.get(guildId) || [];
                    tracker = tracker.filter(t => now - t < 5 * 60 * 1000); // 5 Dakikalık kayan pencere
                    tracker.push(now);
                    avatarTracker.set(guildId, tracker);

                    if (tracker.length >= 3) {
                        increaseThreat(guildId, 15, "Seri Varsayılan Avatar Girişi", member.guild);
                    }
                }

                // Otonom Mod için Tehdit Çarpanı ve Durumu
                const currentThreat = global.guildThreatLevels.get(guildId) || 0;

                // 10. ÖZELLİK: Otonom Katı Mod (Tehdit seviyesi >= 35 ise cezayı sertleştirir)
                let autoStrictEscalated = false;
                if (isFeatureEnabled(guildId, "defaultAvatarAutoStrict") && currentThreat >= 35) {
                    autoStrictEscalated = true;
                }

                let actionTaken = "İşlem Yok";
                let punished = false;

                // 7. ÖZELLİK: Kullanıcıya DM Bildirimi
                if (isFeatureEnabled(guildId, "defaultAvatarDMNotify")) {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle("🛑 Giriş Reddedildi / Kısıtlandı")
                        .setDescription(`**${member.guild.name}** sunucusuna girişiniz güvenlik nedeniyle kısıtlandı.\n\n**Sebep:** Hesabınızda varsayılan avatar (profil resmi olmaması) tespit edilmiştir. Sunucu güvenliği için profil resmi olmayan hesapların sunucuya katılımı sınırlandırılmıştır.`)
                        .setFooter({ text: "Slesy Global Security | Varsayılan Avatar Koruması" });
                    
                    await member.send({ embeds: [dmEmbed] }).catch(() => {});
                }

                // 3. ÖZELLİK: Sunucudan Yasakla (Ban)
                if (isFeatureEnabled(guildId, "defaultAvatarActionBan") || autoStrictEscalated) {
                    await member.ban({ reason: `Slesy Guard - Varsayılan Avatar Koruması (Katı Mod/Raid)` }).catch(() => {});
                    actionTaken = "Sunucudan Yasaklandı (Ban)";
                    punished = true;
                }
                // 2. ÖZELLİK: Sunucudan At (Kick) - ve varsayılan davranış
                else if (isFeatureEnabled(guildId, "defaultAvatarActionKick") || (!isFeatureEnabled(guildId, "defaultAvatarActionQuarantine") && !isFeatureEnabled(guildId, "defaultAvatarActionTimeout"))) {
                    await member.kick("Slesy Guard - Varsayılan Avatar Koruması").catch(() => {});
                    actionTaken = "Sunucudan Atıldı (Kick)";
                    punished = true;
                }
                // 4. ÖZELLİK: Karantinaya Al
                else if (isFeatureEnabled(guildId, "defaultAvatarActionQuarantine")) {
                    const quarantineRoleId = getSetting(guildId, "quarantineRoleId");
                    if (quarantineRoleId) {
                        await member.roles.add(quarantineRoleId, "Varsayılan Avatar Karantinası").catch(() => {});
                        actionTaken = "Karantina Rolü Verildi";
                        punished = true;
                    }
                }
                // 5. ÖZELLİK: Sustur (Timeout)
                else if (isFeatureEnabled(guildId, "defaultAvatarActionTimeout")) {
                    await member.timeout(60 * 60 * 1000, "Varsayılan Avatar Koruması - 1 Saat").catch(() => {});
                    actionTaken = "1 Saat Susturuldu";
                    punished = true;
                }

                // 6. ÖZELLİK: Yetkili Log Bildirimi
                if (isFeatureEnabled(guildId, "defaultAvatarLogStaff") && punished) {
                    sendGuardLog(member.guild, { id: "SYSTEM", tag: "Varsayılan Avatar Koruması" }, member.user, `Avatar Durumu: **Profil Resmi Yok**\nUygulanan Eylem: **${actionTaken}**`, actionTaken, guildId);
                }

                if (punished && (actionTaken.includes("Atıldı") || actionTaken.includes("Yasaklandı"))) {
                    return; 
                }
            }
        }

        // Anti-Raid Koruması Tetikleyicisi
        const isRaidEnabled = isFeatureEnabled(guildId, "raidBlockAll") || isFeatureEnabled(guildId, "raidGuard");
        if (isRaidEnabled) {
            const raidLimit = getSetting(guildId, "raidLimit") || 5;
            const raidTime = getSetting(guildId, "raidTime") || 10;

            // Invite code tracking
            const usedInviteCode = await trackInviteUsed(member);

            let joins = joinTracker.get(guildId) || [];
            joins = joins.filter(t => now - t < raidTime * 1000);
            joins.push(now);
            joinTracker.set(guildId, joins);

            // Calculate interval from last join
            let interval = 0;
            if (joins.length > 1) {
                interval = now - joins[joins.length - 2];
            }

            // Cache details for recovery/cleanup and diagnostics
            let guildRaidJoins = raidJoinsCache.get(guildId) || [];
            guildRaidJoins = guildRaidJoins.filter(item => now - item.time < 30 * 60 * 1000); // keep last 30m
            guildRaidJoins.push({
                time: now,
                userId: member.id,
                tag: member.user.tag,
                inviteCode: usedInviteCode,
                interval: interval
            });
            raidJoinsCache.set(guildId, guildRaidJoins);

            // Maintain similarity history
            let simNames = nameSimilarityHistory.get(guildId) || [];
            simNames.push(member.user.username);
            if (simNames.length > 20) simNames.shift();
            nameSimilarityHistory.set(guildId, simNames);

            // Heuristic flags
            let similarNameCount = 0;
            if (isFeatureEnabled(guildId, "raidDetectSimilarNames")) {
                for (let i = 0; i < simNames.length - 1; i++) {
                    if (areNamesSimilar(member.user.username, simNames[i])) {
                        similarNameCount++;
                    }
                }
            }

            const isYoungAccount = accountAgeDays < 1.0; // < 24 hours
            const isDefaultAvatar = !member.user.avatar;

            // Interval pattern check
            let isPatternJoin = false;
            if (isFeatureEnabled(guildId, "raidDetectPatternJoins") && guildRaidJoins.length >= 3) {
                const lastThree = guildRaidJoins.slice(-3);
                const diff1 = lastThree[1].time - lastThree[0].time;
                const diff2 = lastThree[2].time - lastThree[1].time;
                if (Math.abs(diff1 - diff2) < 150 && diff1 > 200) {
                    isPatternJoin = true;
                }
            }

            // Invite spam check
            let inviteUseCount = 0;
            if (isFeatureEnabled(guildId, "raidDetectInviteSpam") && usedInviteCode !== "bilinmeyen") {
                inviteUseCount = guildRaidJoins.filter(item => item.inviteCode === usedInviteCode && (now - item.time < raidTime * 1000)).length;
            }

            // Check if raid is active or triggered
            let isRaidTriggered = joins.length >= raidLimit;
            let triggerReason = `Raid limiti aşıldı! (${joins.length} giriş / ${raidTime} sn)`;

            if (!isRaidTriggered && isFeatureEnabled(guildId, "raidDetectSimilarNames") && similarNameCount >= 3) {
                isRaidTriggered = true;
                triggerReason = `Benzer isimli üye girişi yoğunluğu tespit edildi (${similarNameCount} benzer isim)`;
            }
            if (!isRaidTriggered && isFeatureEnabled(guildId, "raidDetectInviteSpam") && inviteUseCount >= 3) {
                isRaidTriggered = true;
                triggerReason = `Aynı davet koduyla seri giriş tespit edildi (Kod: ${usedInviteCode}, ${inviteUseCount} giriş)`;
            }
            if (!isRaidTriggered && isFeatureEnabled(guildId, "raidDetectPatternJoins") && isPatternJoin) {
                isRaidTriggered = true;
                triggerReason = `Script/Bot tarzı düzenli aralıklı (pattern) giriş tespit edildi`;
            }

            // Check Whitelist / Bypasses
            let isBypassed = false;
            let bypassReason = "";

            if (member.user.bot) {
                if (isFeatureEnabled(guildId, "raidBypassVerifiedBots") && member.user.flags?.has("VerifiedBot")) {
                    isBypassed = true;
                    bypassReason = "Doğrulanmış Bot";
                }
            } else {
                if (isFeatureEnabled(guildId, "raidBypassOwnerFriends") && isWhitelisted(member.guild, member.id)) {
                    isBypassed = true;
                    bypassReason = "Güvenli Listede";
                }
                if (isFeatureEnabled(guildId, "raidBypassAgeThreshold") && accountAgeDays > 90) {
                    isBypassed = true;
                    bypassReason = "Olgun Hesap (>90 Günlük)";
                }
                if (isFeatureEnabled(guildId, "raidBypassPartnerInvites") && usedInviteCode !== "bilinmeyen") {
                    const guildInvites = await member.guild.invites.fetch().catch(() => null);
                    const inv = guildInvites?.get(usedInviteCode);
                    if (inv && (inv.channel?.name?.includes("partner") || inv.guild?.features?.includes("PARTNERED"))) {
                        isBypassed = true;
                        bypassReason = "Partner Davet Linki";
                    }
                }
            }

            const wasRaidAlreadyActive = activeRaids.has(guildId) && (now - activeRaids.get(guildId) < 15 * 60 * 1000);

            if (isRaidTriggered && !isBypassed) {
                activeRaids.set(guildId, now);
                if (!wasRaidAlreadyActive) {
                    await handleRaidTrigger(member.guild, guildRaidJoins, triggerReason);
                }
            }

            const isCurrentlyRaidActive = activeRaids.has(guildId) && (now - activeRaids.get(guildId) < 15 * 60 * 1000);

            if (isCurrentlyRaidActive && !isBypassed) {
                let actionTaken = "Giriş Kısıtlandı";
                let punished = false;

                let verificationRequired = false;
                if (isFeatureEnabled(guildId, "raidRequireMathVerify")) {
                    verificationRequired = true;
                    const num1 = Math.floor(Math.random() * 9) + 1;
                    const num2 = Math.floor(Math.random() * 9) + 1;
                    const answer = num1 + num2;
                    mathVerifications.set(member.id, {
                        answer: answer,
                        guildId: guildId,
                        timestamp: now
                    });

                    const mathEmbed = new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle("🔢 Güvenlik Doğrulaması: Matematik Sorusu")
                        .setDescription(`**${member.guild.name}** sunucusu şu anda saldırı koruması (Lockdown) altındadır.\nSunucuya erişmek için aşağıdaki matematik sorusunu bu DM üzerinden cevaplamalısınız:\n\n**Soru:** \`${num1} + ${num2} = ?\`\n\n*Lütfen sadece cevabı (sayı olarak) yazıp gönderin. 2 dakika süreniz vardır.*`)
                        .setTimestamp();
                    
                    const dmSent = await member.send({ embeds: [mathEmbed] }).catch(() => null);
                    if (!dmSent) {
                        await member.kick("Guard | Anti-Raid DM Kapalı (Matematik Doğrulaması Gönderilemedi)").catch(() => {});
                        actionTaken = "DM Kapalı Olduğu İçin Sunucudan Atıldı (Kick)";
                        punished = true;
                    } else {
                        const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                        if (quarantineRolId) {
                            await member.roles.add(quarantineRolId, "Anti-Raid Matematik Doğrulaması").catch(() => {});
                        }
                        actionTaken = "Matematik Doğrulaması Gönderildi (Karantinada)";
                        punished = true;
                    }
                } else if (isFeatureEnabled(guildId, "raidRequireCaptcha")) {
                    verificationRequired = true;
                    const captchaEmbed = new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle("🤖 Güvenlik Doğrulaması: Captcha")
                        .setDescription(`**${member.guild.name}** sunucusu saldırı koruması altındadır.\nLütfen sunucuya katılmak için aşağıdaki bağlantıdan Captcha doğrulamasını tamamlayın:\n\n[Captcha Doğrula](https://captcha.slesy.gg/verify?user=${member.id}&guild=${guildId})`)
                        .setTimestamp();
                    const dmSent = await member.send({ embeds: [captchaEmbed] }).catch(() => null);
                    if (!dmSent) {
                        await member.kick("Guard | Anti-Raid DM Kapalı (Captcha Gönderilemedi)").catch(() => {});
                        actionTaken = "DM Kapalı Olduğu İçin Sunucudan Atıldı (Kick)";
                        punished = true;
                    } else {
                        const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                        if (quarantineRolId) {
                            await member.roles.add(quarantineRolId, "Anti-Raid Captcha Doğrulaması").catch(() => {});
                        }
                        actionTaken = "Captcha Doğrulaması Gönderildi (Karantinada)";
                        punished = true;
                    }
                } else if (isFeatureEnabled(guildId, "raidRequireButton")) {
                    verificationRequired = true;
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
                    const rowVerify = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`raid_dm_verify_${guildId}`).setLabel("✅ Ben İnsanım (Doğrula)").setStyle(ButtonStyle.Success)
                    );
                    const buttonEmbed = new EmbedBuilder()
                        .setColor(0xFEE75C)
                        .setTitle("🛡️ Güvenlik Doğrulaması")
                        .setDescription(`**${member.guild.name}** sunucusu şu anda kilit modundadır.\nDoğrulamak için aşağıdaki butona tıklayın.`)
                        .setTimestamp();
                    const dmSent = await member.send({ embeds: [buttonEmbed], components: [rowVerify] }).catch(() => null);
                    if (!dmSent) {
                        await member.kick("Guard | Anti-Raid DM Kapalı (Buton Doğrulaması Gönderilemedi)").catch(() => {});
                        actionTaken = "DM Kapalı Olduğu İçin Sunucudan Atıldı (Kick)";
                        punished = true;
                    } else {
                        const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                        if (quarantineRolId) {
                            await member.roles.add(quarantineRolId, "Anti-Raid Buton Doğrulaması").catch(() => {});
                        }
                        actionTaken = "Buton Doğrulaması Gönderildi (Karantinada)";
                        punished = true;
                    }
                }

                if (!verificationRequired) {
                    if (isFeatureEnabled(guildId, "raidActionBan")) {
                        await member.ban({ reason: `Slesy Guard Anti-Raid | Saldırı Anında Giriş Engelleme` }).catch(() => {});
                        actionTaken = "Saldırı Modu: Sunucudan Yasaklandı (Ban)";
                        punished = true;
                    }
                    else if (isFeatureEnabled(guildId, "raidActionKick")) {
                        await member.kick("Slesy Guard Anti-Raid | Saldırı Anında Giriş Engelleme").catch(() => {});
                        actionTaken = "Saldırı Modu: Sunucudan Atıldı (Kick)";
                        punished = true;
                    }
                    else if (isFeatureEnabled(guildId, "raidActionQuarantine")) {
                        const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                        if (quarantineRolId) {
                            await member.roles.add(quarantineRolId, "Anti-Raid Karantina").catch(() => {});
                            actionTaken = "Saldırı Modu: Karantinaya Alındı";
                            punished = true;
                        }
                    }
                    if (isFeatureEnabled(guildId, "raidActionTimeout")) {
                        await member.timeout(24 * 60 * 60 * 1000, "Anti-Raid Koruması - 24 Saat Susturma").catch(() => {});
                        actionTaken = punished ? actionTaken + " & 24s Susturuldu" : "Saldırı Modu: 24s Susturuldu";
                        punished = true;
                    }
                }

                if (!punished) {
                    await member.kick("Slesy Guard Anti-Raid | Saldırı Koruma Modu Aktif").catch(() => {});
                    actionTaken = "Varsayılan Önlem: Sunucudan Atıldı (Kick)";
                }

                if (isFeatureEnabled(guildId, "raidVerificationLog")) {
                    await sendGuardLog(
                        member.guild, 
                        { id: "SYSTEM", tag: "Anti-Raid Koruması" }, 
                        member.user, 
                        `Hesap Yaşı: **${Math.floor(accountAgeDays)} Gün**\nVarsayılan Avatar: **${isDefaultAvatar ? "Evet" : "Hayır"}**\nKullanılan Davet: **${usedInviteCode}**`, 
                        actionTaken, 
                        guildId
                    );
                }

                if (actionTaken.includes("Atıldı") || actionTaken.includes("Yasaklandı")) {
                    return;
                }
            }
        }

        // Reklamlı İsim Koruması (10 Özellik)
        const isUsernameGuardEnabled = isFeatureEnabled(guildId, "usernameGuard") || isFeatureEnabled(guildId, "usernameRegexGuard");
        if (isUsernameGuardEnabled) {
            let isBypassed = false;
            if (isFeatureEnabled(guildId, "usernameBypassWhitelisted") && isWhitelisted(member.guild, member.id)) {
                isBypassed = true;
            }

            if (!isBypassed) {
                let isViolating = false;
                let violationReason = "";
                const username = member.user.username || "";
                const displayName = member.user.displayName || "";

                // 7. Davet/Link Tespiti
                if (isFeatureEnabled(guildId, "usernameDetectLink") || isFeatureEnabled(guildId, "usernameRegexGuard")) {
                    const linkRegex = /(https?:\/\/|discord\.gg\/|discord\.me\/|\.gg\/|www\.)/gi;
                    if (linkRegex.test(username) || linkRegex.test(displayName)) {
                        isViolating = true;
                        violationReason = "Kullanıcı adında reklam/davet bağlantısı tespit edildi";
                    }
                }

                // 8. Kelime Kara Listesi Taraması
                if (!isViolating && isFeatureEnabled(guildId, "usernameDetectWords")) {
                    const badWords = ["twitch.tv", "youtube.com", "shop", "sales", "reklam", "satış", "csgo", "skins"];
                    const lowerUser = username.toLowerCase();
                    const lowerDisplay = displayName.toLowerCase();
                    const foundWord = badWords.find(w => lowerUser.includes(w) || lowerDisplay.includes(w));
                    if (foundWord) {
                        isViolating = true;
                        violationReason = `Kullanıcı adında yasaklı kelime tespit edildi (${foundWord})`;
                    }
                }

                if (isViolating) {
                    increaseThreat(guildId, 15, "Reklamlı İsim Katılımı", member.guild);

                    let actionTaken = "İşlem Yapılmadı";
                    let punished = false;

                    // 3. Sunucudan Yasakla (Ban)
                    if (isFeatureEnabled(guildId, "usernameActionBan")) {
                        await member.ban({ reason: `Slesy Guard Reklamlı İsim | ${violationReason}` }).catch(() => {});
                        actionTaken = "Sunucudan Yasaklandı (Ban)";
                        punished = true;
                    }
                    // 2. Sunucudan At (Kick)
                    else if (isFeatureEnabled(guildId, "usernameActionKick")) {
                        await member.kick(`Slesy Guard Reklamlı İsim | ${violationReason}`).catch(() => {});
                        actionTaken = "Sunucudan Atıldı (Kick)";
                        punished = true;
                    }
                    // 4. Karantinaya Al
                    else if (isFeatureEnabled(guildId, "usernameActionQuarantine")) {
                        const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                        if (quarantineRolId) {
                            await member.roles.add(quarantineRolId, "Reklamlı İsim Koruması").catch(() => {});
                            actionTaken = "Karantina Rolü Verildi";
                            punished = true;
                        }
                    }
                    // 5. Sustur (Timeout)
                    if (isFeatureEnabled(guildId, "usernameActionTimeout")) {
                        await member.timeout(60 * 60 * 1000, "Reklamlı İsim Koruması - 1 Saat").catch(() => {});
                        actionTaken = punished ? actionTaken + " & 1s Susturuldu" : "1 Saat Susturuldu";
                        punished = true;
                    }
                    // 6. İsim Değiştir (Auto-Nick)
                    if (isFeatureEnabled(guildId, "usernameActionNickChange") && !actionTaken.includes("Ban") && !actionTaken.includes("Kick")) {
                        const safeNick = `Slesy_Safe_${Math.floor(1000 + Math.random() * 9000)}`;
                        await member.setNickname(safeNick, "Reklamlı İsim Koruması").catch(() => {});
                        actionTaken = punished ? actionTaken + " & Nick Değiştirildi" : "Nick Temiz Adla Değiştirildi";
                        punished = true;
                    }

                    // Default legacy fallback if no actions enabled
                    if (!punished) {
                        await member.kick("Guard | Kötü Profil Adı").catch(() => {});
                        actionTaken = "Varsayılan: Sunucudan Atıldı (Kick)";
                    }

                    sendGuardLog(member.guild, { id: "SYSTEM", tag: "Reklamlı İsim Koruması" }, member.user, `${violationReason}`, actionTaken, guildId);

                    if (actionTaken.includes("Atıldı") || actionTaken.includes("Yasaklandı")) {
                        return;
                    }
                }
            }
        }

        // Karantina veya Doğrulama Rolü Verme
        if (isFeatureEnabled(guildId, "buttonVerification") || isFeatureEnabled(guildId, "autoQuarantine")) {
            const quarantineRolId = getSetting(guildId, "quarantineRoleId");
            if (quarantineRolId) {
                member.roles.add(quarantineRolId).catch(() => {});
                if (isFeatureEnabled(guildId, "autoQuarantine")) {
                    sendGuardLog(member.guild, member.user, null, "Otomatik Karantina", "Karantina Rolü Verildi", guildId);
                }
            }
        }
    });

    // Bot Administrator Role Monitor
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        if (!newMember.user.bot) return;
        const guildId = newMember.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        if (addedRoles.size > 0) {
            const hasAdminRole = addedRoles.some(role => role.permissions.has(PermissionFlagsBits.Administrator));
            
            if (hasAdminRole) {
                // Feature 17: antiBotAdminRoleAlert
                if (isFeatureEnabled(guildId, "antiBotAdminRoleAlert")) {
                    const owner = await newMember.guild.members.fetch(newMember.guild.ownerId).catch(() => null);
                    if (owner) {
                        const alertEmbed = new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle("🚨 Kritik Uyarı: Bota Yetki Verildi!")
                            .setDescription(`
Sunucunuzdaki bir bota Yönetici yetkisine sahip bir rol tanımlandı!
**Sunucu:** \`${newMember.guild.name}\`
**Bot:** ${newMember.user} (\`${newMember.user.tag}\`)
**Verilen Rol(ler):** ${addedRoles.map(r => `\`${r.name}\``).join(", ")}
                            `)
                            .setTimestamp();
                        await owner.send({ embeds: [alertEmbed] }).catch(() => {});
                    }
                }

                // Feature 7: antiBotRestrictRoles (Remove added admin roles)
                if (isFeatureEnabled(guildId, "antiBotRestrictRoles")) {
                    const rolesToRemove = addedRoles.filter(role => role.permissions.has(PermissionFlagsBits.Administrator) && !role.managed);
                    if (rolesToRemove.size > 0) {
                        await newMember.roles.remove(rolesToRemove, "Guard | Yetki Kısıtlama Modu").catch(() => {});
                        
                        const logChId = getSetting(guildId, "logChannelId");
                        const logCh = newMember.guild.channels.cache.get(logChId);
                        if (logCh) {
                            const embedAlert = new EmbedBuilder()
                                .setColor(0xFF0000)
                                .setTitle("🛡️ Bot Yetki Kısıtlaması Tetiklendi")
                                .setDescription(`
Bot kullanıcısına yönetici yetkili rol tanımlanmaya çalışıldı fakat otomatik kısıtlandı.
**Bot:** ${newMember.user} (\`${newMember.user.tag}\`)
**Engellenen Rol(ler):** ${rolesToRemove.map(r => `\`${r.name}\``).join(", ")}
                                `)
                                .setTimestamp();
                            await logCh.send({ embeds: [embedAlert] }).catch(() => {});
                        }
                    }
                }
            }
        }
    });

    // Feature 18: antiBotBlockTokenLeaks (bot token post blocker)
    client.on("messageCreate", async (message) => {
        if (!message.guild) return;
        const guildId = message.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        if (message.author.bot && isFeatureEnabled(guildId, "antiBotBlockTokenLeaks")) {
            const tokenRegex = /[M-Z][A-Za-z0-9\-_]{23,25}\.[A-Za-z0-9\-_]{6}\.[A-Za-z0-9\-_]{27,39}/g;
            if (tokenRegex.test(message.content)) {
                await message.delete().catch(() => {});
                const logChId = getSetting(guildId, "logChannelId");
                const logCh = message.guild.channels.cache.get(logChId);
                if (logCh) {
                    const embedLeak = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle("🚨 Bot Token Sızıntısı Engellendi")
                        .setDescription(`
**Bot:** ${message.author} (\`${message.author.tag}\`)
**Kanal:** ${message.channel}
**Eylem:** Mesaj silindi ve sızıntı önlendi.
                        `)
                        .setTimestamp();
                    await logCh.send({ embeds: [embedLeak] }).catch(() => {});
                }
            }
        }
    });

    // Feature 20: antiBotIntegrityLogs (Monitor new bot activities in first 24h)
    client.on("channelCreate", async (channel) => {
        const guild = channel.guild;
        if (!guild) return;
        const guildId = guild.id;
        if (!isFeatureEnabled(guildId, "antiBotIntegrityLogs")) return;

        const entry = await getAuditLogEntry(guild, AuditLogEvent.ChannelCreate);
        if (entry && entry.executor && entry.executor.bot) {
            const member = await guild.members.fetch(entry.executor.id).catch(() => null);
            if (member && member.joinedTimestamp && (Date.now() - member.joinedTimestamp < 86400000)) {
                const logChId = getSetting(guildId, "logChannelId");
                const logCh = guild.channels.cache.get(logChId);
                if (logCh) {
                    const embedIntegrity = new EmbedBuilder()
                        .setColor(0xE67E22)
                        .setTitle("⚠️ Yeni Bot Aktivite Takibi")
                        .setDescription(`
Sunucuya son 24 saatte katılan bot bir işlem gerçekleştirdi:
**Bot:** ${entry.executor}
**Eylem:** Kanal Oluşturma (\`${channel.name}\`)
                        `)
                        .setTimestamp();
                    await logCh.send({ embeds: [embedIntegrity] }).catch(() => {});
                }
            }
        }
    });

    client.on("channelDelete", async (channel) => {
        const guild = channel.guild;
        if (!guild) return;
        const guildId = guild.id;
        if (!isFeatureEnabled(guildId, "antiBotIntegrityLogs")) return;

        const entry = await getAuditLogEntry(guild, AuditLogEvent.ChannelDelete);
        if (entry && entry.executor && entry.executor.bot) {
            const member = await guild.members.fetch(entry.executor.id).catch(() => null);
            if (member && member.joinedTimestamp && (Date.now() - member.joinedTimestamp < 86400000)) {
                const logChId = getSetting(guildId, "logChannelId");
                const logCh = guild.channels.cache.get(logChId);
                if (logCh) {
                    const embedIntegrity = new EmbedBuilder()
                        .setColor(0xE67E22)
                        .setTitle("⚠️ Yeni Bot Aktivite Takibi")
                        .setDescription(`
Sunucuya son 24 saatte katılan bot bir işlem gerçekleştirdi:
**Bot:** ${entry.executor}
**Eylem:** Kanal Silme (\`${channel.name}\`)
                        `)
                        .setTimestamp();
                    await logCh.send({ embeds: [embedIntegrity] }).catch(() => {});
                }
            }
        }
    });

    // Verification approval buttons handler & Owner emergency unlock
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;

        if (customId.startsWith("owner_force_unlock_")) {
            const guildId = customId.replace("owner_force_unlock_", "");
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                await interaction.deferReply({ ephemeral: true });
                await restoreServerLockdown(guild);
                await interaction.editReply({ content: "✅ Sunucu kilidi başarıyla kaldırıldı ve ayarlar normalleştirildi." });
            }
            return;
        }

        if (customId.startsWith("raid_dm_verify_")) {
            const targetGuildId = customId.replace("raid_dm_verify_", "");
            const guild = client.guilds.cache.get(targetGuildId);
            if (guild) {
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                const quarantineRolId = getSetting(targetGuildId, "quarantineRoleId");
                if (member) {
                    if (quarantineRolId) {
                        await member.roles.remove(quarantineRolId).catch(() => {});
                    }
                    await interaction.reply({ content: "✅ Doğrulama başarılı! Sunucuya erişiminiz sağlandı.", ephemeral: true });
                    if (isFeatureEnabled(targetGuildId, "raidVerificationLog")) {
                        await sendGuardLog(guild, { id: "SYSTEM", tag: "Anti-Raid Koruması" }, interaction.user, "Buton Doğrulaması", "Başarıyla Doğruladı", targetGuildId);
                    }
                } else {
                    await interaction.reply({ content: "❌ Sunucuda bulunamadınız.", ephemeral: true });
                }
            }
            return;
        }

        if (!customId.startsWith("approve_bot_") && !customId.startsWith("deny_bot_")) return;

        const isApprove = customId.startsWith("approve_bot_");
        const botId = customId.replace(isApprove ? "approve_bot_" : "deny_bot_", "");
        const guild = interaction.guild;
        const guildId = guild.id;

        if (!isWhitelisted(guild, interaction.user.id, "channel")) {
            return interaction.reply({ content: "❌ Bu botu onaylamak/reddetmek için güvenli listede olmalısınız!", ephemeral: true });
        }

        const member = await guild.members.fetch(botId).catch(() => null);

        if (isApprove) {
            const quarantineRolId = getSetting(guildId, "quarantineRoleId");
            if (member && quarantineRolId) {
                await member.roles.remove(quarantineRolId).catch(() => {});
            }
            await interaction.reply({ content: `✅ Bot (${member ? member.user.tag : botId}) başarıyla onaylandı ve karantinadan çıkarıldı.`, ephemeral: true });
            
            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("🟢 Bot Onaylandı")
                .setDescription(`
Bot onaylandı ve karantinadan çıkarıldı.
**Bot:** ${member ? member.user : `\`${botId}\``}
**Onaylayan Yetkili:** ${interaction.user}
                `)
                .setTimestamp();
            await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
        } else {
            if (member) {
                await member.kick("Guard | Bot Onayı Reddedildi").catch(() => {});
            }
            await interaction.reply({ content: `🔴 Bot (${member ? member.user.tag : botId}) başarıyla reddedildi ve sunucudan atıldı.`, ephemeral: true });

            const embed = new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle("🔴 Bot Reddedildi")
                .setDescription(`
Bot reddedildi ve sunucudan atıldı.
**Bot:** ${member ? member.user.tag : `\`${botId}\``}
**Reddeden Yetkili:** ${interaction.user}
                `)
                .setTimestamp();
            await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
        }
    });

    // Sunucu Güncelleme Koruması (15 Özellik)
    client.on("guildUpdate", async (oldGuild, newGuild) => {
        if (!newGuild) return;
        const guildId = newGuild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiGuildUpdate")) return;

        (async () => {
            const entry = await getAuditLogEntry(newGuild, AuditLogEvent.GuildUpdate);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(newGuild, executor.id, "channel")) return;

            // Speed lock check (Feature 14)
            if (isFeatureEnabled(guildId, "antiGuildFeatureRevertLock")) {
                global.guildUpdateTracker = global.guildUpdateTracker || new Map();
                let timestamps = global.guildUpdateTracker.get(guildId) || [];
                const now = Date.now();
                timestamps = timestamps.filter(t => now - t < 5000); // 5 seconds
                timestamps.push(now);
                global.guildUpdateTracker.set(guildId, timestamps);

                if (timestamps.length > 3) {
                    increaseThreat(guildId, 60, "Spam Sunucu Ayarı Değişikliği (Speed Lock Tetiklendi)", newGuild);
                    await punishAdmin(newGuild, executor, "Spam Sunucu Ayarı Değiştirme (Hızlı Değişim Saldırısı)", guildId);
                    return;
                }
            }

            const revertFields = {};
            const diff = [];

            // Name
            if (newGuild.name !== oldGuild.name && isFeatureEnabled(guildId, "antiGuildNameUpdate")) {
                revertFields.name = oldGuild.name;
                diff.push(`• **Sunucu İsmi:** \`${newGuild.name}\` ➔ \`${oldGuild.name}\``);
            }
            // Icon
            if (newGuild.icon !== oldGuild.icon && isFeatureEnabled(guildId, "antiGuildIconUpdate")) {
                revertFields.icon = oldGuild.iconURL();
                diff.push(`• **Sunucu İkonu:** Değiştirildi ➔ Eski İkon Yüklendi`);
            }
            // Banner
            if (newGuild.banner !== oldGuild.banner && isFeatureEnabled(guildId, "antiGuildBannerUpdate")) {
                revertFields.banner = oldGuild.bannerURL();
                diff.push(`• **Banner Resmi:** Değiştirildi ➔ Eski Banner Yüklendi`);
            }
            // Splash
            if (newGuild.splash !== oldGuild.splash && isFeatureEnabled(guildId, "antiGuildSplashUpdate")) {
                revertFields.splash = oldGuild.splashURL();
                diff.push(`• **Giriş Resmi (Splash):** Değiştirildi ➔ Eski Splash Yüklendi`);
            }
            // Verification Level
            if (newGuild.verificationLevel !== oldGuild.verificationLevel && isFeatureEnabled(guildId, "antiGuildVerificationLevelUpdate")) {
                revertFields.verificationLevel = oldGuild.verificationLevel;
                diff.push(`• **Doğrulama Seviyesi:** \`${newGuild.verificationLevel}\` ➔ \`${oldGuild.verificationLevel}\``);
            }
            // Explicit Content Filter
            if (newGuild.explicitContentFilter !== oldGuild.explicitContentFilter && isFeatureEnabled(guildId, "antiGuildContentFilterUpdate")) {
                revertFields.explicitContentFilter = oldGuild.explicitContentFilter;
                diff.push(`• **Medya İçerik Filtresi:** \`${newGuild.explicitContentFilter}\` ➔ \`${oldGuild.explicitContentFilter}\``);
            }
            // Widget Enabled
            if (newGuild.widgetEnabled !== oldGuild.widgetEnabled && isFeatureEnabled(guildId, "antiGuildWidgetUpdate")) {
                revertFields.widgetEnabled = oldGuild.widgetEnabled;
                diff.push(`• **Sunucu Widgetı:** \`${newGuild.widgetEnabled ? "Açık" : "Kapalı"}\` ➔ \`${oldGuild.widgetEnabled ? "Açık" : "Kapalı"}\``);
            }
            // System Channel
            if (newGuild.systemChannelId !== oldGuild.systemChannelId && isFeatureEnabled(guildId, "antiGuildSystemChannelUpdate")) {
                revertFields.systemChannel = oldGuild.systemChannelId;
                diff.push(`• **Sistem Kanalı:** <#${newGuild.systemChannelId}> ➔ <#${oldGuild.systemChannelId}>`);
            }
            // Rules Channel
            if (newGuild.rulesChannelId !== oldGuild.rulesChannelId && isFeatureEnabled(guildId, "antiGuildRulesChannelUpdate")) {
                revertFields.rulesChannel = oldGuild.rulesChannelId;
                diff.push(`• **Kurallar Kanalı:** <#${newGuild.rulesChannelId}> ➔ <#${oldGuild.rulesChannelId}>`);
            }
            // Public Updates Channel
            if (newGuild.publicUpdatesChannelId !== oldGuild.publicUpdatesChannelId && isFeatureEnabled(guildId, "antiGuildUpdatesChannelUpdate")) {
                revertFields.publicUpdatesChannel = oldGuild.publicUpdatesChannelId;
                diff.push(`• **Güncellemeler Kanalı:** <#${newGuild.publicUpdatesChannelId}> ➔ <#${oldGuild.publicUpdatesChannelId}>`);
            }
            // MFA Level
            if (newGuild.mfaLevel !== oldGuild.mfaLevel && isFeatureEnabled(guildId, "antiGuildMfaLevelUpdate")) {
                revertFields.mfaLevel = oldGuild.mfaLevel;
                diff.push(`• **MFA 2FA Gereksinimi:** \`${newGuild.mfaLevel}\` ➔ \`${oldGuild.mfaLevel}\``);
            }

            // Vanity URL (Feature 13 - separate set method)
            if (newGuild.vanityURLCode !== oldGuild.vanityURLCode && isFeatureEnabled(guildId, "antiGuildVanityUrlUpdate")) {
                await newGuild.setVanityCode(oldGuild.vanityURLCode, "Guard | Vanity URL Koruma").catch(() => {});
                diff.push(`• **Özel Davet Kodu (Vanity):** \`${newGuild.vanityURLCode || "Yok"}\` ➔ \`${oldGuild.vanityURLCode}\``);
            }

            if (diff.length === 0) return;

            increaseThreat(guildId, 30, `Sunucu Ayarları Değiştirildi: ${diff.join(", ")}`, newGuild);

            await punishAdmin(newGuild, executor, `İzinsiz Sunucu Ayarları Güncelleme (${diff.length} Değişiklik)`, guildId);

            // Revert changes
            if (Object.keys(revertFields).length > 0) {
                await newGuild.edit(revertFields, "Guard | Revert Settings").catch(() => {});
            }

            // Owner alert (Feature 15)
            if (isFeatureEnabled(guildId, "antiGuildActionOwnerAlert")) {
                const owner = await newGuild.members.fetch(newGuild.ownerId).catch(() => null);
                if (owner) {
                    const alertEmbed = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle("🖥️ Kritik Uyarı: Sunucu Ayarları Değiştirildi!")
                        .setDescription(`
Sunucu ayarlarınız izinsiz bir yetkili tarafından değiştirildi ve otomatik olarak eski haline geri döndürüldü.
**Eylemi Yapan:** <@${executor.id}> (\`${executor.tag}\` / \`${executor.id}\`)
**Yapılan Değişiklikler:**
${diff.join("\n")}
                        `)
                        .setTimestamp();
                    await owner.send({ embeds: [alertEmbed] }).catch(() => {});
                }
            }
        })();
    });

    // Math Verification DM message listener
    client.on("messageCreate", async (message) => {
        if (!message.guild && mathVerifications.has(message.author.id)) {
            const verification = mathVerifications.get(message.author.id);
            const guild = client.guilds.cache.get(verification.guildId);
            if (!guild) return;

            const answer = parseInt(message.content.trim());
            const member = await guild.members.fetch(message.author.id).catch(() => null);

            if (member) {
                if (answer === verification.answer) {
                    const quarantineRolId = getSetting(verification.guildId, "quarantineRoleId");
                    if (quarantineRolId) {
                        await member.roles.remove(quarantineRolId).catch(() => {});
                    }
                    mathVerifications.delete(message.author.id);
                    await message.reply("✅ Doğrulama başarılı! Sunucuya erişiminiz onaylandı.").catch(() => {});

                    if (isFeatureEnabled(verification.guildId, "raidVerificationLog")) {
                        await sendGuardLog(guild, { id: "SYSTEM", tag: "Anti-Raid Koruması" }, message.author, "Matematik Doğrulaması", "Başarıyla Doğruladı", verification.guildId);
                    }
                } else {
                    await member.kick("Guard Anti-Raid | Yanlış Matematik Cevabı").catch(() => {});
                    mathVerifications.delete(message.author.id);
                    await message.reply("❌ Yanlış cevap! Doğrulama başarısız oldu ve sunucudan atıldınız.").catch(() => {});

                    if (isFeatureEnabled(verification.guildId, "raidVerificationLog")) {
                        await sendGuardLog(guild, { id: "SYSTEM", tag: "Anti-Raid Koruması" }, message.author, "Matematik Doğrulaması", "Yanlış Cevap - Sunucudan Atıldı", verification.guildId);
                    }
                }
            }
        }
    });

    // 10. İsim Değişimini Takip Et (usernameMonitorNickChange)
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        if (newMember.user.bot) return;
        const guildId = newMember.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        if (oldMember.nickname !== newMember.nickname) {
            const isUsernameGuardEnabled = isFeatureEnabled(guildId, "usernameGuard");
            const isMonitorEnabled = isFeatureEnabled(guildId, "usernameMonitorNickChange");

            if (isUsernameGuardEnabled && isMonitorEnabled) {
                let isBypassed = false;
                if (isFeatureEnabled(guildId, "usernameBypassWhitelisted") && isWhitelisted(newMember.guild, newMember.id)) {
                    isBypassed = true;
                }

                if (!isBypassed) {
                    const newNick = newMember.nickname || "";
                    if (newNick === "") return;

                    let isViolating = false;
                    let violationReason = "";

                    if (isFeatureEnabled(guildId, "usernameDetectLink")) {
                        const linkRegex = /(https?:\/\/|discord\.gg\/|discord\.me\/|\.gg\/|www\.)/gi;
                        if (linkRegex.test(newNick)) {
                            isViolating = true;
                            violationReason = "Yeni takma adda reklam/davet bağlantısı tespit edildi";
                        }
                    }

                    if (!isViolating && isFeatureEnabled(guildId, "usernameDetectWords")) {
                        const badWords = ["twitch.tv", "youtube.com", "shop", "sales", "reklam", "satış", "csgo", "skins"];
                        const lowerNick = newNick.toLowerCase();
                        const foundWord = badWords.find(w => lowerNick.includes(w));
                        if (foundWord) {
                            isViolating = true;
                            violationReason = `Yeni takma adda yasaklı kelime tespit edildi (${foundWord})`;
                        }
                    }

                    if (isViolating) {
                        increaseThreat(guildId, 10, "Reklamlı Takma Ad Değişimi", newMember.guild);

                        let actionTaken = "İşlem Yapılmadı";
                        let punished = false;

                        if (isFeatureEnabled(guildId, "usernameActionBan")) {
                            await newMember.ban({ reason: `Slesy Guard Reklamlı Takma Ad | ${violationReason}` }).catch(() => {});
                            actionTaken = "Sunucudan Yasaklandı (Ban)";
                            punished = true;
                        }
                        else if (isFeatureEnabled(guildId, "usernameActionKick")) {
                            await newMember.kick(`Slesy Guard Reklamlı Takma Ad | ${violationReason}`).catch(() => {});
                            actionTaken = "Sunucudan Atıldı (Kick)";
                            punished = true;
                        }
                        else if (isFeatureEnabled(guildId, "usernameActionQuarantine")) {
                            const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                            if (quarantineRolId) {
                                await newMember.roles.add(quarantineRolId, "Reklamlı Takma Ad").catch(() => {});
                                actionTaken = "Karantina Rolü Verildi";
                                punished = true;
                            }
                        }
                        if (isFeatureEnabled(guildId, "usernameActionTimeout")) {
                            await newMember.timeout(60 * 60 * 1000, "Reklamlı Takma Ad - 1 Saat").catch(() => {});
                            actionTaken = punished ? actionTaken + " & 1s Susturuldu" : "1 Saat Susturuldu";
                            punished = true;
                        }
                        if (isFeatureEnabled(guildId, "usernameActionNickChange") && !actionTaken.includes("Ban") && !actionTaken.includes("Kick")) {
                            const safeNick = `Slesy_Safe_${Math.floor(1000 + Math.random() * 9000)}`;
                            await newMember.setNickname(safeNick, "Reklamlı İsim Koruması (Revert)").catch(() => {});
                            actionTaken = punished ? actionTaken + " & Takma Ad Sıfırlandı" : "Takma Ad Temiz Adla Değiştirildi";
                            punished = true;
                        }

                        if (!punished) {
                            await newMember.setNickname(oldMember.nickname, "Reklamlı Takma Ad Değişimi").catch(() => {});
                            actionTaken = "Eski Takma Ada Geri Döndürüldü";
                        }

                        sendGuardLog(newMember.guild, { id: "SYSTEM", tag: "Reklamlı İsim Koruması" }, newMember.user, `${violationReason}`, actionTaken, guildId);
                    }
                }
            }
        }
    });
};
