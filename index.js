// IMPORTACIONES MALDITAS
const { Client, GatewayIntentBits, Partials, SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');
const puppeteer = require('puppeteer');
require('dotenv').config(); // Para leer el TOKEN desde el entorno

// CREACIÓN DEL CLIENTE
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// Variables para las polls
let activePoll = null;
let testPollActive = null;

// FUNCIÓN PARA INICIAR SERVIDOR DE ATERNOS CON PUPPETEER
async function startMinecraftServer() {
  try {
    console.log('🚀 Iniciando servidor de Aternos...');
    
    const browser = await puppeteer.launch({ 
      headless: true, // Cambiar a false si quieres ver el navegador
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Configurar User-Agent para evitar detección
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // IR A ATERNOS
    await page.goto('https://aternos.org/go', { waitUntil: 'networkidle2' });
    
    // HACER LOGIN
    console.log('🔐 Haciendo login en Aternos...');
    await page.click('button[data-page="login"]');
    await page.waitForSelector('input[name="user"]');
    
    await page.type('input[name="user"]', process.env.ATERNOS_USER);
    await page.type('input[name="password"]', process.env.ATERNOS_PASSWORD);
    await page.click('input[type="submit"]');
    
    // Esperar a que cargue la página principal
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // IR AL SERVIDOR
    console.log('🎮 Navegando al servidor...');
    await page.goto(`https://aternos.org/server/${process.env.ATERNOS_SERVER_ID}`, { waitUntil: 'networkidle2' });
    
    // VERIFICAR SI EL SERVIDOR YA ESTÁ ENCENDIDO
    const serverStatus = await page.$('.server-status-label');
    const statusText = await page.evaluate(el => el?.textContent, serverStatus);
    
    if (statusText && statusText.includes('Online')) {
      console.log('ℹ️ El servidor ya está encendido');
      await browser.close();
      return 'already_online';
    }
    
    // INICIAR EL SERVIDOR
    console.log('▶️ Iniciando servidor...');
    const startButton = await page.$('#start');
    
    if (startButton) {
      await startButton.click();
      console.log('✅ Comando de inicio enviado a Aternos');
      
      // Esperar un poco para que se procese
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('⚠️ No se encontró el botón de inicio');
    }
    
    await browser.close();
    return true;
    
  } catch (error) {
    console.error('❌ Error al iniciar el servidor de Aternos:', error);
    return false;
  }
}

// COMANDOS SLASH
const commands = [
  new SlashCommandBuilder()
    .setName('mcpoll')
    .setDescription('Crea una poll para iniciar el servidor de Minecraft'),
  
  new SlashCommandBuilder()
    .setName('testpoll')
    .setDescription('Crea una poll de prueba que inicia el servidor con cualquier reacción')
];

// REGISTRAR COMANDOS
async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  try {
    console.log('📝 Registrando comandos slash...');
    
    // Registrar comandos globalmente (tarda unos minutos en aparecer)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    
    console.log('✅ Comandos registrados exitosamente');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}

// EVENTO: Cuando el bot se conecta
client.once('ready', () => {
  console.log(`✅ BOT CONECTADO COMO: ${client.user.tag}`);
  deployCommands();
});

// COMANDOS DE MENSAJE (¡pong!)
client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.reply('🏓 Pong!');
  }
});

// MANEJO DE COMANDOS SLASH
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channel } = interaction;

  if (commandName === 'mcpoll') {
    // Verificar si ya hay una poll activa
    if (activePoll) {
      await interaction.reply({
        content: '⚠️ Ya hay una poll activa para el servidor de Minecraft.',
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎮 Iniciamos el server de MC?')
      .setDescription('(Requiere 2 votos para prenderlo)')
      .setColor(0x00FF00)
      .addFields(
        { name: '✅ Votos actuales', value: '0/2', inline: true },
        { name: '📊 Estado', value: 'Esperando votos...', inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    
    const message = await interaction.fetchReply();
    await message.react('✅');

    // Guardar poll activa
    activePoll = {
      messageId: message.id,
      channelId: channel.id,
      votes: 0,
      voters: new Set()
    };

  } else if (commandName === 'testpoll') {
    if (testPollActive) {
      await interaction.reply({
        content: '⚠️ Ya hay una poll de prueba activa.',
        ephemeral: true
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🧪 Poll de Prueba - Servidor MC')
      .setDescription('Cualquier reacción de un usuario iniciará el servidor')
      .setColor(0xFF9900)
      .addFields(
        { name: '⚡ Estado', value: 'Esperando cualquier reacción...', inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    
    const message = await interaction.fetchReply();
    await message.react('🎯');

    testPollActive = {
      messageId: message.id,
      channelId: channel.id
    };
  }
});

// MANEJO DE REACCIONES
client.on('messageReactionAdd', async (reaction, user) => {
  // Ignorar reacciones del bot
  if (user.bot) return;

  const messageId = reaction.message.id;
  const channelId = reaction.message.channelId;

  // POLL NORMAL (/mcpoll)
  if (activePoll && messageId === activePoll.messageId) {
    if (reaction.emoji.name === '✅') {
      // Evitar votos duplicados
      if (activePoll.voters.has(user.id)) return;

      activePoll.voters.add(user.id);
      activePoll.votes++;

      // Actualizar embed
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);

      const embed = new EmbedBuilder()
        .setTitle('🎮 Iniciamos el server de MC?')
        .setDescription('(Requiere 2 votos para prenderlo)')
        .setColor(activePoll.votes >= 2 ? 0xFF0000 : 0x00FF00)
        .addFields(
          { name: '✅ Votos actuales', value: `${activePoll.votes}/2`, inline: true },
          { name: '📊 Estado', value: activePoll.votes >= 2 ? '🚀 Iniciando servidor...' : 'Esperando votos...', inline: true }
        )
        .setTimestamp();

      await message.edit({ embeds: [embed] });

      // Si hay 2 o más votos, iniciar servidor
      if (activePoll.votes >= 2) {
        const result = await startMinecraftServer();
        
        const finalEmbed = new EmbedBuilder()
          .setTitle('🎮 Servidor de Minecraft')
          .setColor(result === true ? 0x00FF00 : result === 'already_online' ? 0xFFFF00 : 0xFF0000)
          .setTimestamp();

        if (result === true) {
          finalEmbed.setDescription('✅ ¡Servidor iniciado exitosamente!')
            .addFields({ name: '🎯 Estado', value: 'Servidor encendido', inline: true });
        } else if (result === 'already_online') {
          finalEmbed.setDescription('ℹ️ El servidor ya estaba encendido')
            .addFields({ name: '🎯 Estado', value: 'Ya estaba online', inline: true });
        } else {
          finalEmbed.setDescription('❌ Error al iniciar el servidor')
            .addFields({ name: '🎯 Estado', value: 'Error en el inicio', inline: true });
        }

        await message.edit({ embeds: [finalEmbed] });
        activePoll = null; // Resetear poll
      }
    }
  }

  // POLL DE PRUEBA (/testpoll)
  if (testPollActive && messageId === testPollActive.messageId) {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.messages.fetch(messageId);

    const embed = new EmbedBuilder()
      .setTitle('🧪 Poll de Prueba - Servidor MC')
      .setDescription('🚀 ¡Iniciando servidor por reacción de prueba!')
      .setColor(0xFF0000)
      .addFields(
        { name: '⚡ Estado', value: 'Iniciando servidor...', inline: true },
        { name: '👤 Activado por', value: user.username, inline: true }
      )
      .setTimestamp();

    await message.edit({ embeds: [embed] });

    // Iniciar servidor
    const result = await startMinecraftServer();
    
    const finalEmbed = new EmbedBuilder()
      .setTitle('🧪 Poll de Prueba - Resultado')
      .setColor(result === true ? 0x00FF00 : result === 'already_online' ? 0xFFFF00 : 0xFF0000)
      .setTimestamp();

    if (result === true) {
      finalEmbed.setDescription('✅ ¡Servidor iniciado exitosamente!')
        .addFields(
          { name: '🎯 Estado', value: 'Servidor encendido', inline: true },
          { name: '👤 Activado por', value: user.username, inline: true }
        );
    } else if (result === 'already_online') {
      finalEmbed.setDescription('ℹ️ El servidor ya estaba encendido')
        .addFields(
          { name: '🎯 Estado', value: 'Ya estaba online', inline: true },
          { name: '👤 Verificado por', value: user.username, inline: true }
        );
    } else {
      finalEmbed.setDescription('❌ Error al iniciar el servidor')
        .addFields(
          { name: '🎯 Estado', value: 'Error en el inicio', inline: true },
          { name: '👤 Intentado por', value: user.username, inline: true }
        );
    }

    await message.edit({ embeds: [finalEmbed] });
    testPollActive = null; // Resetear poll de prueba
    
    const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('💀 BOT ACTIVO'));
app.listen(3000, () => {
  console.log('🌐 Keep-alive server en puerto 3000');
  }
});