const { AuditLogEvent, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const {
    isFeatureEnabled,
    getAuditLogEntry,
    punishAdmin,
    increaseThreat,
    getSetting,
    sendGuardLog,
    isWhitelisted
} = require("../guard.js");

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
        // 2. NORMAL MEMBER JOINS
        // ============================================
        increaseThreat(guildId, 6, "Üye Girişi", member.guild);

        // Hesap Yaşı Koruması
        if (isFeatureEnabled(guildId, "accountAgeGuard")) {
            const ageLimitDays = getSetting(guildId, "accountAgeLimit");
            const createdDate = member.user.createdAt;
            const diffDays = Math.ceil((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < ageLimitDays) {
                increaseThreat(guildId, 12, "Yeni Hesap Katılımı", member.guild);
                sendGuardLog(member.guild, member.user, null, `Yeni Hesap Koruması (${diffDays} günlük hesap)`, "Sunucudan Atıldı", guildId);
                member.kick("Guard | Yeni Hesap Koruması").catch(() => {});
                return;
            }
        }

        // Varsayılan Avatar Koruması
        if (isFeatureEnabled(guildId, "defaultAvatarGuard") && !member.user.avatar) {
            increaseThreat(guildId, 10, "Avatar Olmayan Hesap Katılımı", member.guild);
            sendGuardLog(member.guild, member.user, null, "Varsayılan Avatar Koruması", "Sunucudan Atıldı", guildId);
            member.kick("Guard | Varsayılan Avatar Koruması").catch(() => {});
            return;
        }

        // Kötü İsim Koruması
        if (isFeatureEnabled(guildId, "usernameRegexGuard")) {
            const badNameRegex = /(https?:\/\/|discord\.gg\/|www\.)/gi;
            if (badNameRegex.test(member.user.username) || badNameRegex.test(member.user.displayName)) {
                increaseThreat(guildId, 15, "Reklamlı İsim Katılımı", member.guild);
                sendGuardLog(member.guild, member.user, null, "Profil İsim Koruması (Reklam/Link)", "Sunucudan Atıldı", guildId);
                member.kick("Guard | Kötü Profil Adı").catch(() => {});
                return;
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

    // Verification approval buttons handler
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        const customId = interaction.customId;
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
};
