const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const {
    isFeatureEnabled,
    getAuditLogEntry,
    punishAdmin,
    increaseThreat,
    restoreRoleMembers,
    isWhitelisted,
    getSetting,
    checkRateLimit
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

        let shouldRestore = false;
        let reason = "İzinsiz Rol Silme";

        if (isFeatureEnabled(guildId, "antiRoleDelete")) {
            shouldRestore = true;
        }

        // Integration managed roles delete protection
        if (role.managed && isFeatureEnabled(guildId, "antiIntegrationRoleDelete")) {
            shouldRestore = true;
            reason = "Entegrasyon Rolü Silme Engeli";
        }

        if (!shouldRestore) return;

        // Fetch members before deletion from role cache
        const memberIds = role.members.map(m => m.id);

        (async () => {
            const entry = await getAuditLogEntry(role.guild, AuditLogEvent.RoleDelete);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(role.guild, executor.id, "role")) return;

            increaseThreat(guildId, 25, `${reason}: ${role.name}`, role.guild);

            punishAdmin(role.guild, executor, reason, guildId);

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

    // 3. Role Update Protection (Dangerous Permissions safety + 10 new checks)
    client.on("roleUpdate", async (oldRole, newRole) => {
        if (!newRole.guild) return;
        const guildId = newRole.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        (async () => {
            const entry = await getAuditLogEntry(newRole.guild, AuditLogEvent.RoleUpdate);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(newRole.guild, executor.id, "role")) return;

            let shouldRevert = false;
            let reason = "İzinsiz Rol Güncelleme";

            // Anti Everyone Admin Give
            const dangerousPerms = [
                PermissionFlagsBits.Administrator,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.ManageRoles,
                PermissionFlagsBits.ManageChannels
            ];

            if (newRole.id === newRole.guild.id) { // @everyone role
                const adminAdded = newRole.permissions.has(dangerousPerms) && !oldRole.permissions.has(dangerousPerms);
                if (adminAdded && isFeatureEnabled(guildId, "antiEveryoneAdminGive")) {
                    shouldRevert = true;
                    reason = "Everyone Rolüne Yetki Verme Engeli";
                }
            }

            // General Role Update Revert
            if (isFeatureEnabled(guildId, "antiRoleUpdate")) {
                const permChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
                const nameChanged = oldRole.name !== newRole.name;
                if (permChanged || nameChanged) {
                    shouldRevert = true;
                }
            }

            // Anti Dangerous Role Color Change
            const isDangerous = newRole.permissions.has(dangerousPerms);
            if (isFeatureEnabled(guildId, "antiRoleColorChange") && isDangerous && oldRole.color !== newRole.color) {
                shouldRevert = true;
                reason = "Yetkili Rol Rengi Değişim Engeli";
            }

            // Anti Role Name Spam
            if (isFeatureEnabled(guildId, "antiRoleNameSpam") && oldRole.name !== newRole.name) {
                shouldRevert = true;
                reason = "Rol Adı Değişikliği Engeli";
            }

            // Anti Role Hoist Disable
            if (isFeatureEnabled(guildId, "antiRoleHoistDisable") && oldRole.hoist && !newRole.hoist) {
                shouldRevert = true;
                reason = "Rol Hoist Değişikliği Engeli";
            }

            // Anti Role Mentionable Enable
            if (isFeatureEnabled(guildId, "antiRoleMentionableEnable") && !oldRole.mentionable && newRole.mentionable) {
                shouldRevert = true;
                reason = "Rolü Etiketlenebilir Yapma Engeli";
            }

            // Anti Bot Role Modify
            if (isFeatureEnabled(guildId, "antiBotRoleModify") && newRole.managed) {
                shouldRevert = true;
                reason = "Bot Entegrasyon Rolü Değişiklik Engeli";
            }

            // Anti Role Position Change
            if (isFeatureEnabled(guildId, "antiRolePositionChange") && oldRole.rawPosition !== newRole.rawPosition) {
                shouldRevert = true;
                reason = "Rol Hiyerarşisi Değiştirme Engeli";
            }

            if (!shouldRevert) return;

            increaseThreat(guildId, 20, `${reason}: ${newRole.name}`, newRole.guild);
            punishAdmin(newRole.guild, executor, reason, guildId);

            await newRole.edit({
                name: oldRole.name,
                color: oldRole.color,
                hoist: oldRole.hoist,
                mentionable: oldRole.mentionable,
                permissions: oldRole.permissions
            }).catch(() => {});
        })();
    });

    // 4. Member Role Update Monitoring (Bypasses, Limits, Dangerous role give blocking)
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        if (oldMember.roles.cache.size === newMember.roles.cache.size) return;
        const guildId = newMember.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        if (addedRoles.size === 0) return;

        (async () => {
            const entry = await getAuditLogEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate);
            if (!entry) return;
            const executor = entry.executor;

            const dangerousPerms = [
                PermissionFlagsBits.Administrator,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.ManageRoles,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.ManageGuild
            ];

            const dangerousRoles = addedRoles.filter(role => role.permissions.has(dangerousPerms));

            // Whitelisted admin handling
            if (isWhitelisted(newMember.guild, executor.id, "role")) {
                if (isFeatureEnabled(guildId, "antiAdminRoleGiveLimit") && dangerousRoles.size > 0) {
                    const limitMax = getSetting(guildId, "roleGiveLimit");
                    const limitMinutes = getSetting(guildId, "limitTime") || 5;
                    const exceeded = checkRateLimit(guildId, executor.id, "roleGiveLimit", limitMax, limitMinutes);
                    if (exceeded) {
                        increaseThreat(guildId, 40, `Yönetici yetkili rol verme limitini aştı: ${executor.tag}`, newMember.guild);
                        punishAdmin(newMember.guild, executor, `Yönetici Rol Verme Limitini Aşma (Limit: ${limitMax})`, guildId);
                        
                        // Strip added dangerous roles
                        for (const [id, role] of dangerousRoles) {
                            await newMember.roles.remove(role).catch(() => {});
                        }
                    }
                }
                return;
            }

            // Non-whitelist executor giving roles
            if (dangerousRoles.size > 0) {
                increaseThreat(guildId, 30, `Yetkisiz yetkili rol verme: ${newMember.user.tag} -> ${dangerousRoles.map(r => r.name).join(", ")}`, newMember.guild);
                punishAdmin(newMember.guild, executor, "İzinsiz Yetkili Rol Verme", guildId);
                
                // Strip the roles
                for (const [id, role] of dangerousRoles) {
                    await newMember.roles.remove(role).catch(() => {});
                }
            }

            // Anti Community Onboarding Role Spam
            if (isFeatureEnabled(guildId, "antiOnboardingRoleSpam")) {
                // If standard members receive community/join onboarding roles from unauthorized executors, strip them
                const onboardingRoles = addedRoles.filter(role => role.name.toLowerCase().includes("üye") || role.name.toLowerCase().includes("kayıtlı"));
                if (onboardingRoles.size > 0) {
                    increaseThreat(guildId, 15, `İzinsiz Kayıt Rolü Verme: ${newMember.user.tag}`, newMember.guild);
                    punishAdmin(newMember.guild, executor, "İzinsiz Kayıt Rolü Verme", guildId);
                    for (const [id, role] of onboardingRoles) {
                        await newMember.roles.remove(role).catch(() => {});
                    }
                }
            }
        })();
    });
};
