require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// IDs de usuarios y roles permitidos
const allowedUsers = ['640315344916840478', '192746644939210763'];
const allowedRoles = ['1411835087120629952', '1386877603130114098', '1386877176124674109']; // aquí pones IDs de roles
const lastEmbeds = new Map();

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity('Gestionando la VTC', { type: 3 });
  await registerSlashCommands();
});

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName('test').setDescription('Prueba el bot'),
    new SlashCommandBuilder().setName('training').setDescription('Nuevo training').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('join').setDescription('Nuevo conductor').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('media').setDescription('Se une al Media Team').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('hr').setDescription('Se une a Human Resources').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('admin').setDescription('Se une como Staff (Admin)').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('staff').setDescription('Se une al Staff general').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('leave').setDescription('Abandona la VTC').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('ban').setDescription('Usuario baneado de la VTC').addStringOption(opt => opt.setName('nombre').setDescription('Nombre del usuario').setRequired(true)),
    new SlashCommandBuilder().setName('externo').setDescription('Envía el mensaje del embed externo'),
    new SlashCommandBuilder()
      .setName('embed')
      .setDescription('Opciones para enviar o recuperar un embed')
      .addSubcommand(sub =>
        sub.setName('create')
          .setDescription('Crea un embed desde un código generado')
          .addStringOption(opt => opt.setName('codigo').setDescription('Código del embed').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('restore')
          .setDescription('Restaura el último embed enviado por el bot')
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registrados correctamente.');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}

async function sendTeamUpdate(target, text, color = 0x3498DB) {
  const embed = {
    title: 'Rotra Club®',
    description: text,
    color: color
  };
  const message = await target.send({ embeds: [embed] });
  lastEmbeds.set(target.id, message);
  return message;
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const channel = interaction.channel;
  const command = interaction.commandName;
  const subcommand = interaction.options.getSubcommand(false);

  try {
    if (
  !allowedUsers.includes(interaction.user.id) && // ni está en la lista de usuarios
  !interaction.member.roles.cache.some(role => allowedRoles.includes(role.id)) // ni tiene un rol permitido
) {
  return await interaction.reply({
    content: '❌ No tienes permiso para usar este comando.',
    flags: 64
  });
}

    if (command === 'embed') {
      if (subcommand === 'create') {
        const code = interaction.options.getString('codigo');
        try {
          const url = `https://latamexpress-embed.onrender.com/api/embed/${code}`;
          const response = await axios.get(url);
          const embedData = response.data;

          if (typeof embedData.color === 'string' && embedData.color.startsWith('#')) {
            embedData.color = parseInt(embedData.color.replace('#', ''), 16);
          }

          const embed = new EmbedBuilder(embedData);
          const msg = await interaction.channel.send({ embeds: [embed] });
          lastEmbeds.set(channel.id, msg);

          return await interaction.reply({ content: '✅ Embed enviado correctamente.', flags: 64 });
        } catch (error) {
          console.error('❌ Error al obtener el embed:', error);
          return await interaction.reply({ content: '❌ No se pudo obtener el embed.', flags: 64 });
        }
      } else if (subcommand === 'restore') {
        const last = lastEmbeds.get(channel.id);
        if (!last || !last.embeds?.length) {
          return await interaction.reply({ content: '❌ No se encontró un embed reciente en este canal.', flags: 64 });
        }

        await channel.send({ embeds: last.embeds });
        return await interaction.reply({ content: '✅ Embed restaurado correctamente.', flags: 64 });
      }

      return;
    }

    const name = interaction.options.getString('nombre');

    switch (command) {
      case 'test':
        await sendTeamUpdate(channel, 'Ejemplo: Un nuevo miembro se unió al equipo 🎉');
        break;
      case 'training':
        await sendTeamUpdate(channel, `• **${name}** se unió como **Trial Driver** de Rotra Club ®. 🚚`, 0x2ECC71);
        break;	    
      case 'join':
        await sendTeamUpdate(channel, `• **${name}** se unió como **Driver** de Rotra Club ®. 🚚`, 0x2ECC71);
        break;
      case 'media':
        await sendTeamUpdate(channel, `• **${name}** se unió al **Media Team** de Rotra Club ®. 📸`, 0x9B59B6);
        break;
      case 'hr':
        await sendTeamUpdate(channel, `• **${name}** se unió a **Human Resources** de Rotra Club ®. 👩‍💻`, 0x9B59B6);
        break;
      case 'admin':
        await sendTeamUpdate(channel, `• **${name}** se unió como parte del **Staff de Rotra Club ®**. 🛠️`, 0xF1C40F);
        break;
      case 'staff':
        await sendTeamUpdate(channel, `• **${name}** se ha unido al **Staff de Rotra Club ®**. 🧩`, 0x1F618D);
        break;
      case 'leave':
        await sendTeamUpdate(channel, `• **${name}** dejó la VTC. ¡Le deseamos éxito en su camino! 👋`, 0xE74C3C);
        break;
      case 'ban':
        await sendTeamUpdate(channel, `• **${name}** ha sido **baneado** de Rotra Club ®. 🚫`, 0xC0392B);
        break;
      case 'externo':
        await interaction.deferReply({ flags: 64 });
        try {
          const data = fs.readFileSync('./embeds/externo.json', 'utf8');
          const json = JSON.parse(data);
          const options = {};
          if (json.content) options.content = json.content;
          if (Array.isArray(json.embeds)) options.embeds = json.embeds;
          if (Array.isArray(json.components)) options.components = json.components;
          if (typeof json.tts === 'boolean') options.tts = json.tts;
          const msg = await channel.send(options);
          lastEmbeds.set(channel.id, msg);
          await interaction.editReply({ content: '✅ Enviado.' });
        } catch (error) {
          console.error('❌ Error al leer externo.json:', error);
          await interaction.editReply({ content: '❌ Error al enviar el embed externo.' });
        }
        break;
    }

    if (command !== 'embed' && !interaction.deferred && !interaction.replied) {
  await interaction.reply({ content: '✅ Enviado.', flags: 64 });
	}


  } catch (error) {
    console.error('❌ Error al ejecutar comando:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '❌ Ocurrió un error al ejecutar el comando.' });
      } else {
        await interaction.reply({ content: '❌ Ocurrió un error al ejecutar el comando.', flags: 64 });
      }
    } catch (err) {
      console.error('❌ Error al enviar respuesta de error:', err);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);






