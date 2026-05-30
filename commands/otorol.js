const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { updateSetting } = require('../db.js');

/**
 * Builds the interactive auto-role dashboard embed and buttons
 */
function buildOtorolPanel(guild, settings, client) {
  const isEnabled = settings.autorol_enabled ?? (!!global.autoRoles.get(guild.id));

  // Human Roles
  const humanRoles = settings.autorol_human_roles || [];
  if (humanRoles.length === 0) {
    const legacyId = global.autoRoles.get(guild.id);
    if (legacyId) humanRoles.push(legacyId);
  }
  const humanRolesText = humanRoles.length > 0 
    ? humanRoles.map(id => `<@&${id}>`).join(', ') 
    : '`Rol Ayarlanmadı`';

  // Bot Roles
  const botRoles = settings.autorol_bot_roles || [];
  if (botRoles.length === 0) {
    const legacyId = global.autoRoles.get(guild.id);
    if (legacyId) botRoles.push(legacyId);
  }
  const botRolesText = botRoles.length > 0 
    ? botRoles.map(id => `<@&${id}>`).join(', ') 
    : '`Rol Ayarlanmadı`';

  // Tag Roles
  const tagKeyword = settings.autorol_tag_keyword || '';
  const tagRoles = settings.autorol_tag_roles || [];
  const tagText = tagKeyword 
    ? `Tag: \`${tagKeyword}\` ➔ ${tagRoles.length > 0 ? tagRoles.map(id => `<@&${id}>`).join(', ') : 'Rol Ayarlanmadı'}`
    : '`Pasif`';

  // Delay
  const delay = settings.autorol_delay || 0;
  const delayText = delay > 0 ? `\`${delay} Saniye\`` : '`Yok (Anında)`';

  // Log Channel
  const logChannelId = settings.autorol_log_channel || global.ticketLogKanals.get(guild.id);
  const logChannelText = logChannelId ? `<#${logChannelId}>` : '`Bilet Log Kanalı`';

  const embed = new EmbedBuilder()
    .setTitle('⚙️ TBS Gelişmiş Otorol Yapılandırma Paneli')
    .setDescription('Sunucunuza katılan kullanıcılar ve botlar için otomatik rol dağıtımı, gecikmeli rol verme ve isminde sunucu tagı taşıyan üyelere özel rol atama kurallarını buradan yönetin.')
    .setColor('#2ECC71')
    .setThumbnail(guild.iconURL({ dynamic: true }) || client.user.avatarURL())
    .addFields(
      { name: '🟢 Sistem Durumu', value: isEnabled ? '🟢 **Aktif (Roller otomatik veriliyor)**' : '🔴 **Pasif (Sistem kapalı)**', inline: true },
      { name: '⏱️ Katılım Gecikmesi', value: delayText, inline: true },
      { name: '👥 Üye (İnsan) Rolleri', value: humanRolesText, inline: false },
      { name: '🤖 Bot Rolleri', value: botRolesText, inline: false },
      { name: '🏷️ Taglı Üye Koruması', value: tagText, inline: false },
      { name: '📝 Günlük (Log) Kanalı', value: logChannelText, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'TBS Otorol Yönetim Paneli', iconURL: client.user.avatarURL() });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('otorol_toggle')
      .setLabel(isEnabled ? '🔴 Sistemi Durdur' : '🟢 Sistemi Başlat')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('otorol_human')
      .setLabel('👥 Üye Rolleri')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('otorol_bot')
      .setLabel('🤖 Bot Rolleri')
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('otorol_config_delay_tag')
      .setLabel('⏱️ Gecikme & Tag Ayarı')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('otorol_tag_roles_btn')
      .setLabel('🏷️ Tag Rollerini Seç')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!tagKeyword),
    new ButtonBuilder()
      .setCustomId('otorol_reset')
      .setLabel('🗑️ Tümünü Sıfırla')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Event-based auto role assign helper
 */
async function assignRoles(member, settings) {
  const guild = member.guild;
  const rolesToGive = [];
  const logDetails = [];

  if (member.user.bot) {
    const botRoles = settings.autorol_bot_roles || [];
    if (botRoles.length === 0) {
      const legacyId = global.autoRoles.get(guild.id);
      if (legacyId) botRoles.push(legacyId);
    }

    for (const rid of botRoles) {
      const role = guild.roles.cache.get(rid);
      if (role && role.position < guild.members.me.roles.highest.position) {
        rolesToGive.push(role);
        logDetails.push(`${role} (\`Bot Rolü\`)`);
      }
    }
  } else {
    const humanRoles = settings.autorol_human_roles || [];
    if (humanRoles.length === 0) {
      const legacyId = global.autoRoles.get(guild.id);
      if (legacyId) humanRoles.push(legacyId);
    }

    for (const rid of humanRoles) {
      const role = guild.roles.cache.get(rid);
      if (role && role.position < guild.members.me.roles.highest.position) {
        rolesToGive.push(role);
        logDetails.push(`${role} (\`Üye Rolü\`)`);
      }
    }

    // Tag check
    const tagKeyword = settings.autorol_tag_keyword;
    const tagRoles = settings.autorol_tag_roles || [];
    if (tagKeyword && tagRoles.length > 0 && member.user.username.includes(tagKeyword)) {
      for (const rid of tagRoles) {
        const role = guild.roles.cache.get(rid);
        if (role && role.position < guild.members.me.roles.highest.position) {
          rolesToGive.push(role);
          logDetails.push(`${role} (\`Taglı Üye Rolü\`)`);
        }
      }
    }
  }

  if (rolesToGive.length > 0) {
    try {
      await member.roles.add(rolesToGive);

      // Log to config log
      const logChannelId = settings.autorol_log_channel || global.ticketLogKanals.get(guild.id);
      const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📥 Otomatik Rol Verildi')
          .setColor('#2ECC71')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setDescription(`${member} (\`${member.user.tag}\`) sunucuya katıldı ve otomatik rolleri başarıyla aldı.`)
          .addFields(
            { name: '👤 Kullanıcı ID', value: `\`${member.id}\``, inline: true },
            { name: '🤖 Hesap Türü', value: member.user.bot ? '`Bot 🤖`' : '`Kullanıcı 👤`', inline: true },
            { name: '⏳ Gecikme Süresi', value: settings.autorol_delay ? `\`${settings.autorol_delay} Saniye\`` : '`Yok (Anında)`', inline: true },
            { name: '🎭 Atanan Roller', value: logDetails.join(', ') || 'Belirtilmedi', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'TBS Otorol Sistemi' });
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    } catch (err) {
      console.error(`Otorol assignment error for ${member.user.tag}:`, err);
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('otorol')
    .setDescription('Gelişmiş otomatik rol yönetim panelini açar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Modüler Olay Dinleyicisi
  init(client) {
    client.on('guildMemberAdd', async member => {
      try {
        const guild = member.guild;
        const settings = global.guardSettings.get(guild.id) || {};
        
        const isEnabled = settings.autorol_enabled ?? (!!global.autoRoles.get(guild.id));
        if (!isEnabled) return;

        const delay = settings.autorol_delay || 0;
        
        if (delay > 0) {
          setTimeout(() => {
            guild.members.fetch(member.id)
              .then(m => assignRoles(m, settings))
              .catch(() => {});
          }, delay * 1000);
        } else {
          await assignRoles(member, settings);
        }
      } catch (err) {
        console.error('Advanced otorol handler error:', err);
      }
    });
  },

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const settings = global.guardSettings.get(guildId) || {};

    const panel = buildOtorolPanel(interaction.guild, settings, interaction.client);
    
    const reply = await interaction.reply({
      ...panel,
      ephemeral: true
    });

    const collector = reply.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 600000 // 10 minutes
    });

    collector.on('collect', async i => {
      const customId = i.customId;

      if (customId === 'otorol_toggle') {
        await i.deferUpdate();
        const currentlyEnabled = settings.autorol_enabled ?? (!!global.autoRoles.get(guildId));
        settings.autorol_enabled = !currentlyEnabled;
        
        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);

        const newPanel = buildOtorolPanel(interaction.guild, settings, interaction.client);
        await interaction.editReply(newPanel);
      } 
      
      else if (customId === 'otorol_human') {
        const selectMenu = new RoleSelectMenuBuilder()
          .setCustomId('otorol_human_select')
          .setPlaceholder('Üyelere verilecek rolleri seçin...')
          .setMinValues(1)
          .setMaxValues(10);
        
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('otorol_back')
            .setLabel('↩️ Geri Dön')
            .setStyle(ButtonStyle.Secondary)
        );

        await i.update({
          content: '👥 **Lütfen üyeler sunucuya katıldığında atanacak rolleri (Maks 10) aşağıdaki menüden seçin:**',
          embeds: [],
          components: [selectRow, backRow]
        });
      }

      else if (customId === 'otorol_bot') {
        const selectMenu = new RoleSelectMenuBuilder()
          .setCustomId('otorol_bot_select')
          .setPlaceholder('Botlara verilecek rolleri seçin...')
          .setMinValues(1)
          .setMaxValues(10);
        
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('otorol_back')
            .setLabel('↩️ Geri Dön')
            .setStyle(ButtonStyle.Secondary)
        );

        await i.update({
          content: '🤖 **Lütfen botlar sunucuya katıldığında atanacak rolleri (Maks 10) aşağıdaki menüden seçin:**',
          embeds: [],
          components: [selectRow, backRow]
        });
      }

      else if (customId === 'otorol_tag_roles_btn') {
        const selectMenu = new RoleSelectMenuBuilder()
          .setCustomId('otorol_tag_roles_select')
          .setPlaceholder('Taglı üyelere verilecek rolleri seçin...')
          .setMinValues(1)
          .setMaxValues(10);
        
        const selectRow = new ActionRowBuilder().addComponents(selectMenu);
        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('otorol_back')
            .setLabel('↩️ Geri Dön')
            .setStyle(ButtonStyle.Secondary)
        );

        await i.update({
          content: '🏷️ **Lütfen kullanıcı adında tag taşıyan üyelere atanacak rolleri (Maks 10) aşağıdaki menüden seçin:**',
          embeds: [],
          components: [selectRow, backRow]
        });
      }

      else if (customId === 'otorol_back') {
        await i.deferUpdate();
        const newPanel = buildOtorolPanel(interaction.guild, settings, interaction.client);
        await interaction.editReply({
          content: null,
          ...newPanel
        });
      }

      else if (customId === 'otorol_reset') {
        await i.deferUpdate();
        settings.autorol_enabled = false;
        settings.autorol_human_roles = [];
        settings.autorol_bot_roles = [];
        settings.autorol_delay = 0;
        settings.autorol_tag_keyword = '';
        settings.autorol_tag_roles = [];
        settings.autorol_log_channel = null;

        global.autoRoles.delete(guildId);
        await updateSetting(guildId, 'auto_role_id', null);

        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);

        const newPanel = buildOtorolPanel(interaction.guild, settings, interaction.client);
        await interaction.editReply(newPanel);
      }

      else if (customId === 'otorol_config_delay_tag') {
        const modal = new ModalBuilder()
          .setCustomId('otorol_modal')
          .setTitle('Gecikme & Tag Koruması');

        const delayInput = new TextInputBuilder()
          .setCustomId('otorol_delay_input')
          .setLabel('Katılım Gecikmesi (Saniye)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('0 = Anında rol verilir...')
          .setRequired(false)
          .setValue(String(settings.autorol_delay || 0));

        const tagInput = new TextInputBuilder()
          .setCustomId('otorol_tag_input')
          .setLabel('Kullanıcı Adı Tag Filtresi')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('İsimde aratılacak kelime (Örn: TBS)...')
          .setRequired(false)
          .setValue(settings.autorol_tag_keyword || '');

        modal.addComponents(
          new ActionRowBuilder().addComponents(delayInput),
          new ActionRowBuilder().addComponents(tagInput)
        );

        await i.showModal(modal);
      }

      // Select Menu Değer Kayıtları
      else if (i.isRoleSelectMenu()) {
        await i.deferUpdate();
        if (customId === 'otorol_human_select') {
          settings.autorol_human_roles = i.values;
        } else if (customId === 'otorol_bot_select') {
          settings.autorol_bot_roles = i.values;
        } else if (customId === 'otorol_tag_roles_select') {
          settings.autorol_tag_roles = i.values;
        }

        global.guardSettings.set(guildId, settings);
        await updateSetting(guildId, 'guard_settings', settings);

        const newPanel = buildOtorolPanel(interaction.guild, settings, interaction.client);
        await interaction.editReply({
          content: null,
          ...newPanel
        });
      }
    });

    collector.on('end', async () => {
      // Disable buttons
      const disabledRow1 = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(row1.components[0]).setDisabled(true),
        ButtonBuilder.from(row1.components[1]).setDisabled(true),
        ButtonBuilder.from(row1.components[2]).setDisabled(true)
      );
      const disabledRow2 = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(row2.components[0]).setDisabled(true),
        ButtonBuilder.from(row2.components[1]).setDisabled(true),
        ButtonBuilder.from(row2.components[2]).setDisabled(true)
      );

      await interaction.editReply({
        components: [disabledRow1, disabledRow2]
      }).catch(() => {});
    });
  },

  async handleModal(interaction) {
    const guildId = interaction.guild.id;
    const delayStr = interaction.fields.getTextInputValue('otorol_delay_input');
    const tagKeyword = interaction.fields.getTextInputValue('otorol_tag_input') || '';

    const delay = parseInt(delayStr) || 0;

    const settings = global.guardSettings.get(guildId) || {};
    settings.autorol_delay = delay;
    settings.autorol_tag_keyword = tagKeyword;

    global.guardSettings.set(guildId, settings);
    await updateSetting(guildId, 'guard_settings', settings);

    await interaction.reply({
      content: '✅ **Gecikme ve Tag ayarları başarıyla kaydedildi!**\n*Yeni ayarları görmek için kontrol panelini kapatıp tekrar açabilir veya mevcut paneli kullanmaya devam edebilirsiniz.*',
      ephemeral: true
    });
  }
};
