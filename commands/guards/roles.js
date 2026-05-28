const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const {
    isFeatureEnabled,
    getAuditLogEntry,
    punishAdmin,
    increaseThreat,
    restoreRoleMembers,
    isWhitelisted
} = require("../guard.js");

module.exports = (client) => {
    // 1. Role Create Protection
    client.on("roleCreate", async role => {
        if (!role.guild) return;
        const guildId = role.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiRoleCreate")) return;

        const deletePromise = role.delete("Guard | İzinsiz Rol Oluşturma").catch(() => {});

        (async () => {
            const entry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleCreate);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(role.guild, executor.id, "role")) return;

            increaseThreat(guildId, 20, `Rol oluşturuldu: ${role.name}`, role.guild);
            await deletePromise;
            await punishAdmin(role.guild, executor, "İzinsiz Rol Oluşturma", guildId);
        })();
    });

    // 2. Role Delete Protection (Ultra Restore with Member Backup)
    client.on("roleDelete", async role => {
        if (!role.guild) return;
        const guildId = role.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiRoleDelete")) return;

        // Fetch members before deletion from role cache
        const memberIds = role.members.map(m => m.id);

        (async () => {
            const entry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleDelete);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(role.guild, executor.id, "role")) return;

            increaseThreat(guildId, 25, `Rol silindi: ${role.name}`, role.guild);

            punishAdmin(role.guild, executor, "İzinsiz Rol Silme", guildId);

            // Restore role
            const newRole = await role.guild.roles.create({
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                permissions: role.permissions,
                position: role.position
            }).catch(() => null);

            // Restore members role mapping in rate-limit safe queue
            if (newRole && memberIds.length > 0) {
                await restoreRoleMembers(role.guild, newRole, memberIds, guildId);
            }
        })();
    });

    // 3. Role Update Protection (Dangerous Permissions safety)
    client.on("roleUpdate", async (oldRole, newRole) => {
        if (!newRole.guild) return;
        const guildId = newRole.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "antiRoleUpdate")) return;

        (async () => {
            const entry = await getAuditLogEntry(newRole.guild, AuditLogEvent.RoleUpdate);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(newRole.guild, executor.id, "role")) return;

            // Check if dangerous permissions are added to a non-whitelist role
            const dangerousPerms = [
                PermissionFlagsBits.Administrator,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.ManageRoles,
                PermissionFlagsBits.ManageChannels
            ];

            const hadDangerous = oldRole.permissions.has(dangerousPerms);
            const hasDangerous = newRole.permissions.has(dangerousPerms);

            const permChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
            const nameChanged = oldRole.name !== newRole.name;

            if (permChanged || nameChanged) {
                let actionText = `Rol güncellendi: ${newRole.name}`;
                if (hasDangerous && !hadDangerous) {
                    actionText = `Yönetici yetkileri verildi: ${newRole.name}`;
                }

                increaseThreat(guildId, 20, actionText, newRole.guild);
                punishAdmin(newRole.guild, executor, "İzinsiz Rol Güncelleme", guildId);

                await newRole.edit({
                    name: oldRole.name,
                    color: oldRole.color,
                    hoist: oldRole.hoist,
                    mentionable: oldRole.mentionable,
                    permissions: oldRole.permissions
                }).catch(() => {});
            }
        })();
    });
};
