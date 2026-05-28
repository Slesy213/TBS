const { AuditLogEvent } = require("discord.js");
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
    client.on("guildMemberAdd", async member => {
        if (!member.guild) return;
        const guildId = member.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        // 1. Anti-Bot Ekleme
        if (member.user.bot && isFeatureEnabled(guildId, "antiBotAdd")) {
            const kickPromise = member.kick("Guard | İzinsiz Bot").catch(() => {});

            (async () => {
                const entry = await getAuditLogEntry(member.guild, AuditLogEvent.BotAdd);
                if (!entry) return;
                const executor = entry.executor;
                if (!isWhitelisted(member.guild, executor.id, "channel")) {
                    increaseThreat(guildId, 30, `Sunucuya izinsiz bot eklendi: ${member.user.tag}`, member.guild);
                    await kickPromise;
                    await punishAdmin(member.guild, executor, "İzinsiz Bot Ekleme", guildId);
                }
            })();
        }

        // 2. Normal Üye Girişleri
        if (!member.user.bot) {
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
        }
    });

    // Sunucu Güncelleme Koruması
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

            increaseThreat(guildId, 30, "Sunucu ayarları güncellendi", newGuild);

            punishAdmin(newGuild, executor, "İzinsiz Sunucu Ayarları Güncelleme", guildId);

            await newGuild.edit({
                name: oldGuild.name,
                icon: oldGuild.iconURL(),
                banner: oldGuild.bannerURL(),
                splash: oldGuild.splashURL()
            }).catch(() => {});
        })();
    });
};
