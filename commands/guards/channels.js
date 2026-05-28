const { AuditLogEvent, ChannelType } = require("discord.js");
const { 
    isFeatureEnabled, 
    getAuditLogEntry, 
    punishAdmin, 
    increaseThreat, 
    isWhitelisted,
    getSetting
} = require("../guard.js");

module.exports = (client) => {
    // 1. Channel Create Protection
    client.on("channelCreate", async channel => {
        if (!channel.guild) return;
        const guildId = channel.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        let shouldRevert = false;
        let reason = "İzinsiz Kanal Oluşturma";

        const isFreezeActive = global.integrityFreeze && global.integrityFreeze.get(guildId);

        if (isFeatureEnabled(guildId, "antiChannelCreate") || isFreezeActive) {
            shouldRevert = true;
            if (isFreezeActive) reason = "Anti-Raid Aktif (Kanal İşlemleri Donduruldu)";
        }

        // Anti Channel Clone Detection
        if (isFeatureEnabled(guildId, "antiChannelClone") && channel.name.endsWith("-copy")) {
            shouldRevert = true;
            reason = "Kanal Klonlama Engeli";
        }

        if (!shouldRevert) return;

        // Non-blocking action
        const deletePromise = channel.delete("Guard | " + reason).catch(() => {});

        (async () => {
            const entry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelCreate);
            if (!entry) return;
            const executor = entry.executor;
            const isOwner = executor.id === channel.guild.ownerId;
            if (isWhitelisted(channel.guild, executor.id, "channel") && !(isFreezeActive && !isOwner)) return;

            increaseThreat(guildId, 20, `${reason}: ${channel.name}`, channel.guild);
            await deletePromise;
            await punishAdmin(channel.guild, executor, reason, guildId);
        })();
    });

    // 2. Channel Delete Protection
    client.on("channelDelete", async channel => {
        if (!channel.guild) return;
        const guildId = channel.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        const isFreezeActive = global.integrityFreeze && global.integrityFreeze.get(guildId);
        let shouldRestore = false;
        let reason = "İzinsiz Kanal Silme";

        if (isFeatureEnabled(guildId, "antiChannelDelete") || isFreezeActive) {
            shouldRestore = true;
            if (isFreezeActive) reason = "Anti-Raid Aktif (Kanal İşlemleri Donduruldu)";
        }

        // Category Delete Protection
        if (channel.type === ChannelType.GuildCategory && isFeatureEnabled(guildId, "antiCategoryDelete")) {
            shouldRestore = true;
            reason = "Kategori Silme Engeli";
        }

        if (!shouldRestore) return;

        (async () => {
            const entry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelDelete);
            if (!entry) return;
            const executor = entry.executor;
            const isOwner = executor.id === channel.guild.ownerId;
            if (isWhitelisted(channel.guild, executor.id, "channel") && !(isFreezeActive && !isOwner)) return;

            increaseThreat(guildId, 25, `${reason}: ${channel.name}`, channel.guild);

            punishAdmin(channel.guild, executor, reason, guildId);

            // Restore channel (Preserving Category and Overwrites)
            const restored = await channel.guild.channels.create({
                name: channel.name,
                type: channel.type,
                parent: channel.parentId,
                topic: channel.topic,
                nsfw: channel.nsfw,
                rateLimitPerUser: channel.rateLimitPerUser,
                bitrate: channel.bitrate,
                userLimit: channel.userLimit,
                position: channel.position,
                permissionOverwrites: channel.permissionOverwrites.cache.map(o => ({
                    id: o.id,
                    allow: o.allow.toArray(),
                    deny: o.deny.toArray()
                }))
            }).catch(() => null);

            // Re-parent orphaned channels if a category was deleted
            if (channel.type === ChannelType.GuildCategory && restored) {
                const orphanedChannels = channel.guild.channels.cache.filter(c => c.parentId === channel.id);
                for (const [id, orphan] of orphanedChannels) {
                    await orphan.setParent(restored.id, { lockPermissions: false }).catch(() => {});
                }
            }
        })();
    });

    // 3. Channel Update Protection
    client.on("channelUpdate", async (oldChannel, newChannel) => {
        if (!newChannel.guild) return;
        const guildId = newChannel.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        (async () => {
            const entry = await getAuditLogEntry(newChannel.guild, AuditLogEvent.ChannelUpdate);
            if (!entry) return;
            const executor = entry.executor;
            const isFreezeActive = global.integrityFreeze && global.integrityFreeze.get(guildId);
            const isOwner = executor.id === newChannel.guild.ownerId;
            if (isWhitelisted(newChannel.guild, executor.id, "channel") && !(isFreezeActive && !isOwner)) return;

            let shouldRevert = false;
            let reason = "Kanal Güncelleme";

            if (isFeatureEnabled(guildId, "antiChannelUpdate") || isFreezeActive) {
                shouldRevert = true;
                if (isFreezeActive) reason = "Anti-Raid Aktif (Kanal İzinleri Donduruldu)";
            }

            // Anti Overwrite Clear
            if (isFeatureEnabled(guildId, "antiChannelOverwriteClear") && oldChannel.permissionOverwrites.cache.size > 0 && newChannel.permissionOverwrites.cache.size === 0) {
                shouldRevert = true;
                reason = "İzin Sıfırlama Engeli";
            }

            // Anti Slowmode Change
            if (isFeatureEnabled(guildId, "antiChannelSlowmodeChange") && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
                shouldRevert = true;
                reason = "Yavaş Mod Değişim Koruması";
            }

            // Anti NSFW Disable
            if (isFeatureEnabled(guildId, "antiNSFWDisable") && oldChannel.nsfw && !newChannel.nsfw) {
                shouldRevert = true;
                reason = "NSFW Kapatma Koruması";
            }

            // Anti Name Spam
            if (isFeatureEnabled(guildId, "antiChannelNameSpam") && oldChannel.name !== newChannel.name) {
                shouldRevert = true;
                reason = "Kanal Adı Değişikliği";
            }

            // Anti Voice Bitrate
            if (isFeatureEnabled(guildId, "antiVoiceBitrateSpam") && oldChannel.bitrate !== newChannel.bitrate) {
                shouldRevert = true;
                reason = "Ses Kanalı Bitrate Koruması";
            }

            // Anti Voice Limit
            if (isFeatureEnabled(guildId, "antiVoiceLimitChange") && oldChannel.userLimit !== newChannel.userLimit) {
                shouldRevert = true;
                reason = "Ses Kanalı Üye Limiti Koruması";
            }

            // Stage Channel Spam
            if (isFeatureEnabled(guildId, "antiStageChannelSpam") && newChannel.type === ChannelType.GuildStageVoice) {
                shouldRevert = true;
                reason = "Kürsü Kanalı İstismarı Engeli";
            }

            if (!shouldRevert) return;

            increaseThreat(guildId, 15, `${reason}: ${newChannel.name}`, newChannel.guild);

            punishAdmin(newChannel.guild, executor, reason, guildId);

            await newChannel.edit({
                name: oldChannel.name,
                topic: oldChannel.topic,
                nsfw: oldChannel.nsfw,
                parent: oldChannel.parentId,
                rateLimitPerUser: oldChannel.rateLimitPerUser,
                bitrate: oldChannel.bitrate,
                userLimit: oldChannel.userLimit,
                permissionOverwrites: oldChannel.permissionOverwrites.cache.map(o => ({
                    id: o.id,
                    allow: o.allow.toArray(),
                    deny: o.deny.toArray()
                }))
            }).catch(() => {});
        })();
    });

    // 4. Webhook & Integration Protections
    client.on("webhookUpdate", async channel => {
        if (!channel.guild) return;
        const guildId = channel.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        (async () => {
            const logs = await channel.guild.fetchAuditLogs({ limit: 1 }).catch(() => null);
            if (!logs) return;
            const entry = logs.entries.first();
            if (!entry || (Date.now() - entry.createdTimestamp) > 8000) return;

            const executor = entry.executor;
            if (isWhitelisted(channel.guild, executor.id, "channel")) return;

            const targetId = entry.target.id;

            if (entry.action === AuditLogEvent.WebhookCreate) {
                // Feature 1: antiWebhookCreate
                if (isFeatureEnabled(guildId, "antiWebhookCreate")) {
                    increaseThreat(guildId, 20, `Webhook oluşturuldu (Engellendi)`, channel.guild);
                    punishAdmin(channel.guild, executor, `İzinsiz Webhook Oluşturma`, guildId);
                    const webhooks = await channel.fetchWebhooks().catch(() => null);
                    const target = webhooks?.get(targetId);
                    if (target) await target.delete("Guard | Webhook Oluşturma Engeli").catch(() => {});
                    return;
                }

                // Feature 9: webhookLimitPerChannel
                if (isFeatureEnabled(guildId, "webhookLimitPerChannel")) {
                    const webhooks = await channel.fetchWebhooks().catch(() => null);
                    if (webhooks && webhooks.size > 1) {
                        increaseThreat(guildId, 15, `Kanal webhook limiti aşıldı (Silindi)`, channel.guild);
                        punishAdmin(channel.guild, executor, `Webhook Limit Aşımı`, guildId);
                        const target = webhooks.get(targetId);
                        if (target) await target.delete("Guard | Kanal Webhook Limiti").catch(() => {});
                        return;
                    }
                }
            }

            if (entry.action === AuditLogEvent.WebhookDelete) {
                // Feature 2: antiWebhookDelete
                if (isFeatureEnabled(guildId, "antiWebhookDelete")) {
                    increaseThreat(guildId, 25, `Webhook silindi (Kurtarıldı)`, channel.guild);
                    punishAdmin(channel.guild, executor, `İzinsiz Webhook Silme`, guildId);
                    // Recreate webhook
                    await channel.createWebhook({
                        name: entry.target.name || "Kurtarılan Webhook",
                        avatar: entry.target.avatarURL ? entry.target.avatarURL() : null,
                        reason: "Guard | Webhook Silme Engeli"
                    }).catch(() => {});
                }
            }

            if (entry.action === AuditLogEvent.WebhookUpdate) {
                let shouldRevert = false;
                let reason = "Webhook Güncelleme";
                let threat = 15;

                // Feature 3: antiWebhookUpdate
                if (isFeatureEnabled(guildId, "antiWebhookUpdate")) {
                    shouldRevert = true;
                    reason = "İzinsiz Webhook Güncelleme";
                }

                // Feature 7: webhookChannelLock
                const channelIdChange = entry.changes.find(c => c.key === "channel_id");
                if (isFeatureEnabled(guildId, "webhookChannelLock") && channelIdChange) {
                    shouldRevert = true;
                    reason = "Webhook Kanal Kilidi İhlali";
                    threat = 20;
                }

                // Feature 8: webhookAvatarLock
                const avatarChange = entry.changes.find(c => c.key === "avatar_hash");
                if (isFeatureEnabled(guildId, "webhookAvatarLock") && avatarChange) {
                    shouldRevert = true;
                    reason = "Webhook Avatar Kilidi İhlali";
                }

                if (shouldRevert) {
                    increaseThreat(guildId, threat, reason, channel.guild);
                    punishAdmin(channel.guild, executor, reason, guildId);

                    const webhooks = await channel.fetchWebhooks().catch(() => null);
                    const target = webhooks?.get(targetId);
                    if (target) {
                        const oldName = entry.changes.find(c => c.key === "name")?.old;
                        const oldChannelId = channelIdChange?.old;

                        let editData = {};
                        if (oldName) editData.name = oldName;
                        if (oldChannelId) editData.channel = oldChannelId;

                        if (Object.keys(editData).length > 0) {
                            await target.edit(editData).catch(() => {});
                        } else {
                            await target.delete("Guard | Güvenli Olmayan Güncelleme").catch(() => {});
                        }
                    }
                }
            }
        })();
    });
};
