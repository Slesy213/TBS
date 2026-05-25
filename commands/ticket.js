const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

// ===================== AYARLAR =====================

const TICKET_KATEGORI_ID = '1480260274459115673';
const YETKILI_ROL_ID     = '1508421375021289532';
const LOG_KANAL_ID       = '1508421229164494940';

// ===================================================

const TICKET_TURLERI = [
  {
    id: 'genel',
    label: 'Genel Destek',
    emoji: '🎫',
    aciklama: 'Genel sorunlarınız için destek alın.',
    renk: 0x5865f2,
    kanalAdi: 'genel-destek',
  },
  {
    id: 'teknik',
    label: 'Teknik Destek',
    emoji: '🔧',
    aciklama: 'Teknik sorunlarınız için destek alın.',
    renk: 0x57f287,
    kanalAdi: 'teknik-destek',
  },
  {
    id: 'sikayet',
    label: 'Şikayet',
    emoji: '📋',
    aciklama: 'Şikayetlerinizi buradan iletebilirsiniz.',
    renk: 0xfee75c,
    kanalAdi: 'sikayet',
  },
  {
    id: 'ban_itiraz',
    label: 'Ban İtiraz',
    emoji: '🔨',
    aciklama: 'Ban kararına itiraz etmek için açın.',
    renk: 0xed4245,
    kanalAdi: 'ban-itiraz',
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-kur')
    .setDescription('Ticket panelini kurar')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {

    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('Ticket Paneli Kur');

    const mesajInput = new TextInputBuilder()
      .setCustomId('ticket_mesaj')
      .setLabel('Panel mesajını buraya yaz')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('🎫 Turkey Bus Simulator\n\nDestek almak için aşağıdaki butonlardan kategori seç.')
      .setRequired(true)
      .setMaxLength(2000);

    const resimInput = new TextInputBuilder()
      .setCustomId('ticket_resim')
      .setLabel('Resim URL (opsiyonel)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://...')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(mesajInput),
      new ActionRowBuilder().addComponents(resimInput),
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {

    const mesaj =
      interaction.fields.getTextInputValue('ticket_mesaj');

    const resimUrl =
      interaction.fields.getTextInputValue('ticket_resim') || null;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(mesaj)
      .setTimestamp();

    if (resimUrl) embed.setImage(resimUrl);

    const butonlar = TICKET_TURLERI.map(tur =>
      new ButtonBuilder()
        .setCustomId(`ticket_ac_${tur.id}`)
        .setLabel(tur.label)
        .setEmoji(tur.emoji)
        .setStyle(
          tur.id === 'ban_itiraz'
            ? ButtonStyle.Danger
            : ButtonStyle.Success
        )
    );

    const satirlar = [];

    for (let i = 0; i < butonlar.length; i += 3) {
      satirlar.push(
        new ActionRowBuilder().addComponents(
          butonlar.slice(i, i + 3)
        )
      );
    }

    await interaction.channel.send({
      embeds: [embed],
      components: satirlar
    });

    await interaction.reply({
      content: '✅ Ticket paneli kuruldu!',
      ephemeral: true
    });
  },

  async handleButton(interaction) {

    const turId =
      interaction.customId.replace(
        'ticket_ac_',
        ''
      );

    const tur =
      TICKET_TURLERI.find(
        t => t.id === turId
      );

    if (!tur) return;

    // BAN İTİRAZ MODAL

    if (tur.id === 'ban_itiraz') {

      const modal = new ModalBuilder()
        .setCustomId('ban_itiraz_modal')
        .setTitle('Ban İtiraz Formu');

      const sebepInput = new TextInputBuilder()
        .setCustomId('ban_sebep')
        .setLabel('Neden banlandığını düşünüyorsun?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Ban sebebini açıkla...')
        .setRequired(true)
        .setMaxLength(1000);

      const itirazInput = new TextInputBuilder()
        .setCustomId('ban_itiraz_metni')
        .setLabel('İtiraz gerekçen nedir?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Neden bansız kalman gerektiğini açıkla...')
        .setRequired(true)
        .setMaxLength(1000);

      const hesapInput = new TextInputBuilder()
        .setCustomId('ban_hesap')
        .setLabel('Oyun adın / hesap bilgin (varsa)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('örn: Slesy#1234')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(sebepInput),
        new ActionRowBuilder().addComponents(itirazInput),
        new ActionRowBuilder().addComponents(hesapInput),
      );

      return interaction.showModal(modal);
    }

    await this._kanalAc(interaction, tur, null);
  },

  async handleBanItirazModal(interaction) {

    const tur =
      TICKET_TURLERI.find(
        t => t.id === 'ban_itiraz'
      );

    const sebep =
      interaction.fields.getTextInputValue('ban_sebep');

    const itiraz =
      interaction.fields.getTextInputValue('ban_itiraz_metni');

    const hesap =
      interaction.fields.getTextInputValue('ban_hesap') || 'Belirtilmedi';

    const ekBilgi = {
      sebep,
      itiraz,
      hesap
    };

    await this._kanalAc(
      interaction,
      tur,
      ekBilgi
    );
  },

  async _kanalAc(interaction, tur, ekBilgi) {

    const guild = interaction.guild;
    const user  = interaction.user;

    // 🔥 AKTİF TICKET KONTROLÜ

    const aktifTicket = guild.channels.cache.find(c =>
      c.parentId === TICKET_KATEGORI_ID &&
      c.permissionOverwrites.cache.has(user.id)
    );

    if (aktifTicket) {
      return interaction.reply({
        content: `❌ Zaten açık bir ticketin var! Önce kapatman gerekiyor → <#${aktifTicket.id}>`,
        ephemeral: true,
      });
    }

    // Kanal oluştur

    const kanal = await guild.channels.create({
      name:
        `${tur.kanalAdi}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,

      type: ChannelType.GuildText,

      parent: TICKET_KATEGORI_ID,

      permissionOverwrites: [

        {
          id: guild.roles.everyone,
          deny: ['ViewChannel']
        },

        {
          id: user.id,
          allow: [
            'ViewChannel',
            'SendMessages',
            'ReadMessageHistory'
          ]
        },

        {
          id: YETKILI_ROL_ID,
          allow: [
            'ViewChannel',
            'SendMessages',
            'ReadMessageHistory',
            'ManageMessages'
          ]
        },
      ],
    });

    // Embed

    const ticketEmbed = new EmbedBuilder()
      .setColor(tur.renk)
      .setTitle(`${tur.emoji} ${tur.label} | Destek Talebi`)
      .setDescription(
        `👋 Merhaba <@${user.id}>, destek talebin başarıyla oluşturuldu!\n\n` +
        `📌 **Ticket Türü:** ${tur.label}\n` +
        `🕒 **Oluşturulma:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
        `🔔 Lütfen sorununu detaylı şekilde açıkla.\n` +
        `💡 Yetkililer en kısa sürede yardımcı olacaktır.\n\n` +
        `📎 Butonları kullanabilirsin:\n` +
        `• 👤 Sahiplen\n` +
        `• ➕ Kullanıcı Ekle\n` +
        `• 🔒 Ticketı Kapat`
      )
      .setTimestamp()
      .setFooter({
        text: `${guild.name} Destek Sistemi`
      });

    // Butonlar

    const sahiplen = new ButtonBuilder()
      .setCustomId('ticket_sahiplen')
      .setLabel('👤 Sahiplen')
      .setStyle(ButtonStyle.Primary);

    const ekle = new ButtonBuilder()
      .setCustomId('ticket_ekle')
      .setLabel('➕ Kullanıcı Ekle')
      .setStyle(ButtonStyle.Success);

    const kapat = new ButtonBuilder()
      .setCustomId('ticket_kapat')
      .setLabel('🔒 Ticketı Kapat')
      .setStyle(ButtonStyle.Danger);

    // Ticket mesajı

    await kanal.send({

      content:
        `<@${user.id}> <@&${YETKILI_ROL_ID}>`,

      embeds: [ticketEmbed],

      components: [
        new ActionRowBuilder().addComponents(
          sahiplen,
          ekle,
          kapat
        )
      ],
    });

    // LOG

    const logKanal =
      guild.channels.cache.get(
        LOG_KANAL_ID
      );

    if (logKanal) {

      const logEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎫 Ticket Açıldı')
        .addFields(
          {
            name: '👤 Kullanıcı',
            value: `${user}`,
          },
          {
            name: '📂 Ticket Türü',
            value: tur.label,
          },
          {
            name: '📄 Kanal',
            value: `${kanal}`,
          }
        )
        .setTimestamp();

      logKanal.send({
        embeds: [logEmbed]
      });
    }

    await interaction.reply({
      content:
        `✅ Ticketın oluşturuldu → <#${kanal.id}>`,
      ephemeral: true,
    });
  },

  // SAHİPLEN

  async handleSahiplen(interaction) {

    if (
      !interaction.member.roles.cache.has(
        YETKILI_ROL_ID
      )
    ) {
      return interaction.reply({
        content: '❌ Bunun için yetkin yok.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(
        `👤 Ticket ${interaction.user} tarafından sahiplenildi.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  },

  // KULLANICI EKLE

  async handleEkle(interaction) {

    const modal = new ModalBuilder()
      .setCustomId('ticket_ekle_modal')
      .setTitle('Tickete Kullanıcı Ekle');

    const userInput = new TextInputBuilder()
      .setCustomId('eklencek_user')
      .setLabel('Kullanıcı ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Kullanıcı ID gir')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        userInput
      )
    );

    await interaction.showModal(modal);
  },

  async handleEkleModal(interaction) {

    const userId =
      interaction.fields.getTextInputValue(
        'eklencek_user'
      );

    try {

      const member =
        await interaction.guild.members.fetch(userId);

      await interaction.channel.permissionOverwrites.edit(member.id, {

        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,

      });

      await interaction.reply({
        content:
          `✅ <@${member.id}> tickete eklendi.`,
      });

    } catch {

      await interaction.reply({
        content:
          '❌ Geçersiz kullanıcı IDsi girdin.',
        ephemeral: true,
      });
    }
  },

  // KAPAT

  async handleKapat(interaction) {

    const kanal = interaction.channel;

    // LOG

    const logKanal =
      interaction.guild.channels.cache.get(
        LOG_KANAL_ID
      );

    if (logKanal) {

      const logEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('🔒 Ticket Kapatıldı')
        .addFields(
          {
            name: '👤 Kapatan',
            value: `${interaction.user}`,
          },
          {
            name: '📄 Kanal',
            value: `${interaction.channel.name}`,
          }
        )
        .setTimestamp();

      logKanal.send({
        embeds: [logEmbed]
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔒 Ticket Kapatılıyor...')
      .setDescription(
        `Ticket <@${interaction.user.id}> tarafından kapatıldı.\nKanal 5 saniye içinde silinecek.`
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });

    setTimeout(() => {

      kanal.delete().catch(() => {});

    }, 5000);
  },
};
