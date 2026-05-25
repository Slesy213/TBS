const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bir kullanıcıyı banlar.')
        .addUserOption(option =>
            option
                .setName('kişi')
                .setDescription('Banlanacak kişi')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('sebep')
                .setDescription('Ban sebebi')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {

        const user = interaction.options.getUser('kişi');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.reply({
                content: 'Bu kullanıcı sunucuda bulunamadı.',
                ephemeral: true
            });
        }

        if (!member.bannable) {
            return interaction.reply({
                content: 'Bu kullanıcıyı banlayamıyorum.',
                ephemeral: true
            });
        }

        // DM mesajı
        try {
            await user.send(
                `🚫 Turkey Bus Simulator sunucusundan banlandınız.\n\nSebep: ${reason}`
            );
        } catch (err) {
            console.log('DM gönderilemedi.');
        }

        // Ban işlemi
        await member.ban({ reason });

        await interaction.reply({
            content: `✅ ${user.tag} kullanıcısı banlandı.\nSebep: ${reason}`
        });
    }
};
