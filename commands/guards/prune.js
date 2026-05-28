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
    // Slinding window / tracker for member removals to detect prune
    global.pruneTracker = global.pruneTracker || new Map();

    client.on("guildMemberRemove", async (member) => {
        if (!member.guild) return;
        const guild = member.guild;
        const guildId = guild.id;

        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiPrune")) return;

        let tracker = global.pruneTracker.get(guildId);
        if (!tracker) {
            tracker = {
                count: 0,
                removedMembers: [],
                lastAuditLogEntryId: null,
                processing: false,
                timeout: null
            };
            global.pruneTracker.set(guildId, tracker);
        }

        tracker.count++;
        tracker.removedMembers.push(member.id);

        // If >= 5 member removals occur in a short window, trigger prune audit check
        if (tracker.count >= 5 && !tracker.processing) {
            tracker.processing = true;

            if (tracker.timeout) clearTimeout(tracker.timeout);

            // Wait 1.5 seconds to accumulate removals and let the audit log write
            tracker.timeout = setTimeout(async () => {
                try {
                    await handlePruneDetection(guild, tracker);
                } catch (err) {
                    console.error("Error handling prune detection:", err);
                } finally {
                    tracker.count = 0;
                    tracker.removedMembers = [];
                    tracker.processing = false;
                }
            }, 1500);
        } else {
            if (tracker.timeout) clearTimeout(tracker.timeout);
            tracker.timeout = setTimeout(() => {
                tracker.count = 0;
                tracker.removedMembers = [];
            }, 3000);
        }
    });

    async function handlePruneDetection(guild, tracker) {
        const guildId = guild.id;

        // Feature 14: antiPruneAuditDoubleCheck
        let entry = await getAuditLogEntry(guild, AuditLogEvent.MemberPrune, 3, 500);
        if (isFeatureEnabled(guildId, "antiPruneAuditDoubleCheck")) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const secondEntry = await getAuditLogEntry(guild, AuditLogEvent.MemberPrune, 2, 300);
            if (secondEntry && (!entry || secondEntry.id !== entry.id)) {
                entry = secondEntry;
            }
        }

        if (!entry) return;
        if (tracker.lastAuditLogEntryId === entry.id) return;

        // Verify entry age (should be recent, within last 30 seconds)
        if (Date.now() - entry.createdTimestamp > 30000) return;

        tracker.lastAuditLogEntryId = entry.id;

        const executor = entry.executor;
        if (!executor) return;

        // Whitelist Bypass Check
        if (isWhitelisted(guild, executor.id, "channel")) return;

        let violation = false;
        let reason = "Yetkisiz Budama (Prune) İşlemi";

        // Feature 2: antiPruneBlockAll
        if (isFeatureEnabled(guildId, "antiPruneBlockAll")) {
            violation = true;
            reason = "Budama İşlemi Engeli Aktif (Tüm Prunelar Yasaklı)";
        }

        // Feature 3: antiPruneLimitDays
        const deleteMemberDays = parseInt(entry.extra?.deleteMemberDays || "7");
        if (isFeatureEnabled(guildId, "antiPruneLimitDays") && deleteMemberDays < 30) {
            violation = true;
            reason = `Budama Gün Sınırı İhlali: ${deleteMemberDays} gün seçildi (Minimum 30 gün olmalı)`;
        }

        // Feature 4: antiPruneMinRoles
        if (isFeatureEnabled(guildId, "antiPruneMinRoles")) {
            violation = true;
            reason = "Budama Rol Sınırı İhlali (Filtresiz Toplu Üye Budaması)";
        }

        // Feature 13: antiPruneTimeLimit
        if (isFeatureEnabled(guildId, "antiPruneTimeLimit")) {
            const hour = new Date().getHours();
            if (hour >= 23 || hour <= 6) {
                violation = true;
                reason = `Şüpheli Saat Diliminde Budama: Saat ${hour}:00 (Gece Kısıtlaması)`;
            }
        }

        // Feature 12: antiPruneRoleRecoveryTracker
        let roleDeletedRecently = false;
        let deletedRoleNames = [];
        if (isFeatureEnabled(guildId, "antiPruneRoleRecoveryTracker")) {
            const roleDeleteLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 5 }).catch(() => null);
            if (roleDeleteLogs) {
                const now = Date.now();
                for (const roleEntry of roleDeleteLogs.entries.values()) {
                    if (now - roleEntry.createdTimestamp < 20000) { // last 20 seconds
                        roleDeletedRecently = true;
                        deletedRoleNames.push(roleEntry.target?.name || "Bilinmeyen Rol");
                    }
                }
            }
            if (roleDeletedRecently) {
                violation = true;
                reason = `Budama Bypass Tespiti: Prune öncesi rol silmeleri yapıldı (${deletedRoleNames.join(", ")})`;
            }
        }

        // If not flagged as violation yet, but antiPrune is active, any unauthorized prune is violation
        if (!violation) {
            violation = true;
        }

        if (violation) {
            // Feature 9: antiPruneThreatMax
            if (isFeatureEnabled(guildId, "antiPruneThreatMax")) {
                global.guildThreatLevels.set(guildId, 100);
                increaseThreat(guildId, 100, `Budama Saldırısı Algılandı (${reason})`, guild);
            } else {
                increaseThreat(guildId, 50, `Budama Eylemi: ${reason}`, guild);
            }

            // Feature 8: antiPruneLockdownOnPrune
            if (isFeatureEnabled(guildId, "antiPruneLockdownOnPrune")) {
                await executeLockdown(guild);
            }

            // Feature 15: antiPruneIntegrityQuarantine
            if (isFeatureEnabled(guildId, "antiPruneIntegrityQuarantine")) {
                const staffMembers = await guild.members.fetch().catch(() => null);
                if (staffMembers) {
                    const quarantineRolId = getSetting(guildId, "quarantineRoleId");
                    for (const member of staffMembers.values()) {
                        if (member.id === guild.ownerId || member.id === guild.client.user.id || member.id === executor.id) continue;
                        if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                            if (quarantineRolId) {
                                await member.roles.set([quarantineRolId]).catch(() => {});
                            } else {
                                await member.roles.set([]).catch(() => {});
                            }
                        }
                    }
                }
            }

            // Determine Punishment and Execute (Features 5, 6, 7)
            let punishActionText = "İkaz & Loglandı";
            const member = await guild.members.fetch(executor.id).catch(() => null);

            if (member && executor.id !== guild.ownerId) {
                const hasBan = isFeatureEnabled(guildId, "antiPruneActionBanExecutor");
                const hasKick = isFeatureEnabled(guildId, "antiPruneActionKickExecutor");
                const hasStrip = isFeatureEnabled(guildId, "antiPruneActionStripRoles");

                if (hasBan) {
                    punishActionText = "Sunucudan Yasaklandı";
                    await punishAdmin(guild, executor, `Kritik İhlal: ${reason}`, guildId);
                } else if (hasKick) {
                    punishActionText = "Sunucudan Atıldı";
                    if (hasStrip) {
                        await member.roles.set([]).catch(() => {});
                        punishActionText = "Rolleri Alındı & Sunucudan Atıldı";
                    }
                    await member.kick(`Guard | Prune Koruması: ${reason}`).catch(() => {});
                    await sendGuardLog(guild, executor, null, reason, punishActionText, guildId);
                } else if (hasStrip) {
                    punishActionText = "Yetkileri Alındı (Rolleri Silindi)";
                    await member.roles.set([]).catch(() => {});
                    await sendGuardLog(guild, executor, null, reason, punishActionText, guildId);
                } else {
                    // Default punishment fallback
                    punishActionText = "Yetkileri Alındı & Yasaklandı (Varsayılan)";
                    await punishAdmin(guild, executor, `Prune Koruması: ${reason}`, guildId);
                }
            }

            // Feature 10: antiPruneOwnerNotification
            if (isFeatureEnabled(guildId, "antiPruneOwnerNotification")) {
                const owner = await guild.members.fetch(guild.ownerId).catch(() => null);
                if (owner) {
                    const embedAlert = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle("🚨 Sunucuda Budama (Prune) Saldırısı Algılandı!")
                        .setDescription(`
Sunucunuzda yetkili bir üye tarafından budama işlemi gerçekleştirildi ve sistem tarafından engellendi.

**Yönetici:** <@${executor.id}> (\`${executor.tag}\` / \`${executor.id}\`)
**İhlal Nedeni:** \`${reason}\`
**Uygulanan Ceza:** \`${punishActionText}\`

**Detaylar:**
• **İnaktiflik Gün Filtresi:** \`${entry.extra?.deleteMemberDays || "Bilinmiyor"}\` Gün
• **Silinen Üye Sayısı:** \`${entry.extra?.membersRemoved || "Bilinmiyor"}\` Üye
${roleDeletedRecently ? `\n⚠️ **Kritik Denetim:** Son 20 saniye içinde rol silme eylemleri algılandı! Silinen Roller: \`${deletedRoleNames.join(", ")}\`` : ""}
                        `)
                        .setTimestamp();
                    await owner.send({ embeds: [embedAlert] }).catch(() => {});
                }
            }

            // Feature 11: antiPruneLogStaff
            if (isFeatureEnabled(guildId, "antiPruneLogStaff")) {
                await sendGuardLog(
                    guild,
                    executor,
                    null,
                    `Budama Girişimi - ${reason} (Gün: ${entry.extra?.deleteMemberDays || "Bilinmiyor"}, Silinen: ${entry.extra?.membersRemoved || "Bilinmiyor"})`,
                    punishActionText,
                    guildId
                );
            }
        }
    }

    async function executeLockdown(guild) {
        const channels = guild.channels.cache;
        for (const channel of channels.values()) {
            try {
                if (channel.isTextBased()) {
                    await channel.permissionOverwrites.edit(guild.roles.everyone, {
                        SendMessages: false,
                        AddReactions: false
                    }, { reason: "Guard | Prune Koruması Lockdown" }).catch(() => {});
                } else if (channel.isVoiceBased()) {
                    await channel.permissionOverwrites.edit(guild.roles.everyone, {
                        Connect: false,
                        Speak: false
                    }, { reason: "Guard | Prune Koruması Lockdown" }).catch(() => {});
                }
            } catch (err) {
                // Ignore single channel errors
            }
        }
    }
};
