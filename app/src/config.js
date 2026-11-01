module.exports = {
  // Configuração básica
  listen: {
    ip: '0.0.0.0',
    port: process.env.PORT || 3000,
  },
  // Outras configurações padrão
  cors: {
    origin: '*',
  },
};
