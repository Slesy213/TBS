const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  // data property'si olmayan komutları atla (prefix komutlar vb.)
  if (!command.data) {
    console.log(`⚠️ ${file} dosyasında data bulunamadı, atlanıyor.`);
    continue;
  }

  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Global slash komutları yükleniyor...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Global komutlar başarıyla yüklendi!');
  } catch (error) {
    console.error(error);
  }
})();
