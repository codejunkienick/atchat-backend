import 'babel-polyfill';
import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import config from './config';
import http from 'http';
import SocketIo from 'socket.io';
import mongoose from 'mongoose';
import passport from 'passport';
import Account from './models/user';
import routes from './routes/index';
import logger from 'morgan';
import {CronJob} from 'cron';
import Immutable from 'immutable';
import _ from 'lodash';
import {authenticateSocket} from 'utils/socketAuth';
import {mapUrl} from 'utils/url.js';
//import PrettyError from 'pretty-error';

const app = express();
const MongoStore = require('connect-mongo')(session);
const server = new http.Server(app);
const io = new SocketIo(server);

mongoose.connect(config.server.databaseURL);
const sessionStore = new MongoStore({mongooseConnection: mongoose.connection}, function(err){
  console.log(err || 'connect-mongodb setup ok');
});

app.use(cookieParser());
app.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  key: 'usersid',
  cookie: {maxAge: 120000}
}));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }) );
app.use(passport.initialize());
app.use(passport.session());

passport.use(Account.createStrategy());
passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());

app.use('/', routes);

const bufferSize = 100;
const messageBuffer = new Array(bufferSize);
let messageIndex = 0;

if (config.apiPort) {
  const runnable = app.listen(config.apiPort, (err) => {
    if (err) {
      console.error(err);
    }
    console.info('----\n==> 🌎  API is running on port %s', config.apiPort);
    console.info('==> 💻  Send requests to http://%s:%s', config.apiHost, config.apiPort);
  });

  io.listen(runnable);
  io.use(authenticateSocket(sessionStore));

  let usersSearching = [];
  let currentChats = Immutable.Stack();
  let connectionMap = new Map();

  const connectUsers = new CronJob('* * * * * *', async function() {
    if (usersSearching.length < 2) return;
    usersSearching = _.shuffle(usersSearching);
    while (usersSearching.length >= 2) {
      const socketFirst = usersSearching.pop();
      const socketSecond = usersSearching.pop();
      const userFirst = await getUser(socketFirst.session.passport.user);
      const userSecond = await getUser(socketSecond.session.passport.user);
      if (!socketFirst || !socketSecond || !userFirst || !userSecond) {
        console.log('[ERR] Internal bug with connecting users' );
        return;
      }
      const syncTime = Date.now();
      const dataForFirst = {
        displayName: userSecond.displayName,
        username: userSecond.username,
        time: syncTime
      };
      const dataForSecond = {
        displayName: userFirst.displayName,
        username: userFirst.username,
        time: syncTime
      };
      // const talk = {
      //   user1: socketFirst,
      //   user2: socketSecond,
      //   endTime: syncTime.setMinutes(syncTime.getMinutes() + 2)
      // };
      // currentChats.unshift(talk);
      connectionMap.set(userFirst.username, socketSecond);
      connectionMap.set(userSecond.username, socketFirst);
      console.log(dataForFirst);
      console.log('[SOCKET] ' + userFirst.username + ' connected to ' + userSecond.username);
      socketFirst.emit('foundBuddy', dataForFirst);
      socketSecond.emit('foundBuddy', dataForSecond);
    }
  }, null, false, 'America/Los_Angeles');

  const disconnectUsers = new CronJob('*/10 * * * * *', function() {
    if (!currentChats.first()) return;
    while (currentChats.first().endTime < Date.now()) {
      let lastTalk = currentChats.first();
      console.log(lastTalk);
      lastTalk.user1.emit('stopTalk');
      lastTalk.user2.emit('stopTalk');
      connectionMap.delete(user1.session.passport.user);
      connectionMap.delete(user2.session.passport.user);
      currentChats.shift();
    }
  }, null, false, 'America/Los_Angeles');

  connectUsers.start();
  disconnectUsers.start();

  async function getUser(userId) {
    try {
      return await Account.findOne({username: userId});
    } catch (err) {
      console.log(err);
    }
  }

  async function handleUserSocket(socket) {
    try {
      const user = await getUser(socket.session.passport.user);
      socket.on('findBuddy', (data) => {
        console.log("[SOCKET] User " + user.username + " started searching");
        usersSearching.push(socket);
      });
      socket.on('stopFindingBuddy', (data) => {
        usersSearching = _.without(usersSearching, socket);
      });
      socket.on('newMessage', (data) => {
        console.log(user.username + " sends message to" + data.username);
        let reciever = connectionMap.get(user.username);
        reciever.emit("newMessage", data.message);
      })
    } catch (err) {
      console.log(err);
    }
  }

  io.on('connection', function (socket) {
    function die(err) {
      console.log('ERR in socket handling', err);
      socket.emit('speedchat.error', err.toString());
      socket.disconnect();
    }
    const session = socket.session;
    if (!session) return die('no session in socket - internal bug');

    const userId = session.passport.user;
    if (!userId) return die("no authenticated user in socket's session");

    console.log("USER: '" + userId + "' connected to ws");
    handleUserSocket(socket);
  });
} else {
  console.error('==>     ERROR: No PORT environment variable has been specified');
}
