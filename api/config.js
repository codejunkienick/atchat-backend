require('babel-polyfill');

const environment = {
  development: {
    isProduction: false
  },
  production: {
    isProduction: true
  }
}[process.env.NODE_ENV || 'development'];

module.exports = Object.assign({
  host: process.env.HOST || '127.0.0.1',
  port: process.env.PORT,
  apiHost: process.env.APIHOST || '127.0.0.1',
  apiPort: process.env.APIPORT || 3001,
  server: {
    databaseURL: 'mongodb://localhost/speedchat'
  },
  secret: 'superdupersecretkey' // change in production

}, environment);
