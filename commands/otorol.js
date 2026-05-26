const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

module.exports = {

  data: new SlashCommandBuilder()
    .setName('otorol')
    .setDescription('Sunucuya girenlere otomatik rol verir.')
    .addRoleOption(option =>
      option
        .setName('rol')
        .setDescription('Verilecek rol')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  async execute(interaction) {

    const role =
      interaction.options.getRole('rol');

    global.autoRoleId = role.id;

    await interaction.reply({
      content:
        `✅ Oto rol ayarlandı: ${role}`,
      ephemeral: true
    });
  }
};
