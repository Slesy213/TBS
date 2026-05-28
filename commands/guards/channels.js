const { AuditLogEvent } = require("discord.js");
const { 
    isFeatureEnabled, 
    getAuditLogEntry, 
    punishAdmin, 
    increaseThreat, 
    isWhitelisted 
} = require("../guard.js");

module.exports = (client) => {
    // 1. Channel Create Protection
    client.on("channelCreate", async channel => {
        if (!channel.guild) return;
        const guildId = channel.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiChannelCreate")) return;

        // Non-blocking action
        const deletePromise = channel.delete("Guard | İzinsiz Kanal Oluşturma").catch(() => {});

        (async () => {
            const entry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelCreate);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(channel.guild, executor.id, "channel")) return;

            increaseThreat(guildId, 20, `Kanal oluşturuldu: ${channel.name}`, channel.guild);
            await deletePromise;
            await punishAdmin(channel.guild, executor, "İzinsiz Kanal Oluşturma", guildId);
        })();
    });

    // 2. Channel Delete Protection
    client.on("channelDelete", async channel => {
        if (!channel.guild) return;
        const guildId = channel.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiChannelDelete")) return;

        (async () => {
            const entry = await getAuditLogEntry(channel.guild, AuditLogEvent.ChannelDelete);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(channel.guild, executor.id, "channel")) return;

            increaseThreat(guildId, 25, `Kanal silindi: ${channel.name}`, channel.guild);

            punishAdmin(channel.guild, executor, "İzinsiz Kanal Silme", guildId);

            // Restore channel (Preserving Category and Overwrites)
            await channel.guild.channels.create({
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
            }).catch(() => {});
        })();
    });

    // 3. Channel Update Protection
    client.on("channelUpdate", async (oldChannel, newChannel) => {
        if (!newChannel.guild) return;
        const guildId = newChannel.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiChannelUpdate")) return;

        (async () => {
            const entry = await getAuditLogEntry(newChannel.guild, AuditLogEvent.ChannelUpdate);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(newChannel.guild, executor.id, "channel")) return;

            increaseThreat(guildId, 15, `Kanal güncellendi: ${newChannel.name}`, newChannel.guild);

            punishAdmin(newChannel.guild, executor, "İzinsiz Kanal Güncelleme", guildId);

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

            let actionType = "";
            if (entry.action === AuditLogEvent.WebhookCreate && isFeatureEnabled(guildId, "antiWebhookCreate")) actionType = "Webhook Oluşturma";
            else if (entry.action === AuditLogEvent.WebhookDelete && isFeatureEnabled(guildId, "antiWebhookDelete")) actionType = "Webhook Silme";
            else if (entry.action === AuditLogEvent.WebhookUpdate && isFeatureEnabled(guildId, "antiWebhookUpdate")) actionType = "Webhook Güncelleme";

            if (!actionType) return;

            const executor = entry.executor;
            if (isWhitelisted(channel.guild, executor.id, "channel")) return;

            increaseThreat(guildId, 15, `Webhook ihlali: ${actionType}`, channel.guild);

            punishAdmin(channel.guild, executor, `İzinsiz ${actionType}`, guildId);

            if (entry.action === AuditLogEvent.WebhookCreate) {
                const webhooks = await channel.fetchWebhooks().catch(() => null);
                if (webhooks) {
                    const target = webhooks.first();
                    if (target) await target.delete().catch(() => {});
                }
            }
        })();
    });
};
