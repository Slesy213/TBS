const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Bir kullanıcının banını kaldırır.')
        .addStringOption(option =>
            option
                .setName('kullanici')
                .setDescription('Kullanıcı ID veya kullanıcı adı')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {

        const input = interaction.options.getString('kullanici');

        const bans = await interaction.guild.bans.fetch();

        const bannedUser = bans.find(ban =>
            ban.user.id === input ||
            ban.user.username.toLowerCase() === input.toLowerCase()
        );

        if (!bannedUser) {
            return interaction.reply({
                content: '❌ Böyle banlı bir kullanıcı bulunamadı.',
                ephemeral: true
            });
        }

        await interaction.guild.members.unban(bannedUser.user.id);

        await interaction.reply({
            content: `✅ ${bannedUser.user.tag} kullanıcısının banı kaldırıldı.`
        });
    }
};
