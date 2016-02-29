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
import _ from 'lodash';
import {authenticateSocket} from 'actions/socketAuth';
const Immutable = require('immutable');

const app = express();
const MongoStore = require('connect-mongo')(session);
const server = new http.Server(app);
const io = new SocketIo(server);

mongoose.connect(config.server.databaseURL);
export const sessionStore = new MongoStore({mongooseConnection: mongoose.connection}, function(err){
  console.log(err || 'connect-mongodb setup ok');
});

app.use(cookieParser(config.secret));
app.use(session({
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  key: 'usersid',
  cookie: {maxAge: 1200000}
}));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }) );
app.use(passport.initialize());
app.use(passport.session());

passport.use(Account.createStrategy());
passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());

app.use( (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, X-AUTHENTICATION, X-IP, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

app.use('/user/', routes);

const bufferSize = 100;
const messageBuffer = new Array(bufferSize);
let messageIndex = 0;

if (config.apiPort) {
  const runnable = app.listen(config.apiPort, (err) => {
    if (err) {
      console.error(err);
    }
    console.info('----\n==>  API is running on port %s', config.apiPort);
    console.info('==>  Send requests to http://%s:%s', config.apiHost, config.apiPort);
  });

  io.listen(runnable);
  io.use(authenticateSocket(sessionStore));

  //
  let usersSearchingIds = Immutable.Set();
  let usersSearchingSet = Immutable.Set();

  // Stack of current chats and exchanges to process in Cron Job
  let currentChats = Immutable.Stack();
  let exchangeChats = Immutable.Stack();

  // Map username of one user to the socket of the other
  let connectionMap = new Map();
  let exchangeMap = new Map();

  // Cron locks
  let connectionInProgress = false;
  let disconnectInProgress = false;
  let endExchageInProgress = false;

  const connectUsersJob = new CronJob('* * * * * *', async function() {
    if (connectionInProgress || usersSearchingSet.size < 2) return;
    connectionInProgress = true;
    let usersSearching = usersSearchingSet.toArray();
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
      const endTime = new Date(new Date().getTime() + config.chatDuration).getTime();
      const dataForFirst = {
        receiver: {
          displayName: userSecond.displayName,
          username: userSecond.username,
        },
        time: syncTime
      };
      const dataForSecond = {
        receiver: {
          displayName: userFirst.displayName,
          username: userFirst.username,
        },
        time: syncTime
      };
      const talk = {
        user1: socketFirst,
        user2: socketSecond,
        endTime: endTime
      };
      currentChats = currentChats.push(talk);
      connectionMap.set(userFirst.username, socketSecond);
      connectionMap.set(userSecond.username, socketFirst);
      console.log('[SOCKET] ' + userFirst.username + ' connected to ' + userSecond.username);
      socketFirst.emit('startChat', dataForFirst);
      socketSecond.emit('startChat', dataForSecond);
    }
    usersSearchingSet = Immutable.Set(usersSearching);
    connectionInProgress = false;
  }, null, false);

  const disconnectUsersJob = new CronJob('* * * * * *', function() {
    if (!currentChats.first() || currentChats.first() == undefined || disconnectInProgress) return;
    disconnectInProgress = true;
    while (true) {
      const lastTalk = currentChats.first();
      if (!lastTalk || lastTalk.endTime - new Date().getTime() > 0) {
        break;
      }

      const username1 = lastTalk.user1.session.passport.user;
      const username2 = lastTalk.user2.session.passport.user;
      if (!connectionMap.has(username1) || !connectionMap.has(username2)) {
        //This means talk was aborted and we no longer need to process it
        currentChats = currentChats.pop();
        continue;
      }
      console.log(lastTalk.endTime - new Date().getTime());
      console.log('[CRON] removing last talk ');
      console.log('between ' + username1 + " and " + username2);
      lastTalk.user1.emit('stopTalk');
      lastTalk.user2.emit('stopTalk');
      const exchangeTime = new Date(new Date().getTime() + config.exchangeDuration).getTime();
      const exchageTalk = {
        exchangeTime: exchangeTime,
        user1: lastTalk.user1,
        user2: lastTalk.user2,
      };
      exchangeChats.push(exchageTalk);
      exchangeMap.set(username1, lastTalk.user2);
      exchangeMap.set(username2, lastTalk.user1);

      connectionMap.delete(username1);
      connectionMap.delete(username2);
      currentChats = currentChats.pop();

    }
    disconnectInProgress = false;
  }, null, false);

  const endExchageJob = new CronJob('* * * * * *', function() {
    if (!exchangeChats.first() || exchangeChats.first() == undefined || disconnectInProgress) return;
    endExchageInProgress = true;
    while (true) {
      const lastTalk = exchangeChats.first();
      if (!lastTalk || lastTalk.exchangeTime - new Date().getTime() > 0) {
        break;
      }

      const username1 = lastTalk.user1.session.passport.user;
      const username2 = lastTalk.user2.session.passport.user;
      if (!exchangeMap.has(username1) || !exchangeMap.has(username2)) {
        //This means talk was aborted and we no longer need to process it
        exchangeChats = exchangeChats.pop();
        continue;
      }
      console.log(lastTalk.endTime - new Date().getTime());
      lastTalk.user1.emit('stopExchange');
      lastTalk.user2.emit('stopExchange');
      exchangeChats.pop();

    }
    endExchageInProgress = false;
  }, null, false);

  connectUsersJob.start();
  disconnectUsersJob.start();

  function abortTalk(userSocket, receiverSocket) {
    receiverSocket.emit('abortTalk');
    connectionMap.delete(userSocket.session.passport.user);
    connectionMap.delete(receiverSocket.session.passport.user);
    exchangeMap.delete(userSocket.session.passport.user);
    exchangeMap.delete(receiverSocket.session.passport.user);
    console.log('Aborted talk');
  }

  async function getUser(userId) {
    try {
      return await Account.findOne({username: userId});
    } catch (err) {
      console.log(err);
    }
  }
  function disconnectSocket(socket, err) {
    console.log('ERR in socket handling', err);
    socket.emit('speedchat.error', err.toString());
    socket.disconnect();
  }
  async function handleUserSocket(socket) {
    try {
      const user = await getUser(socket.session.passport.user);

      socket.on('findBuddy', (data) => {
        console.log("[SOCKET] User " + user.username + " started searching");
        if (usersSearchingIds.has(user.username)) {
          console.log('[SOCKET] User ' + user.username + ' multiple search ' );
        }
        usersSearchingIds = usersSearchingIds.add(user.username);
        usersSearchingSet = usersSearchingSet.add(socket);
      });

      socket.on('exchange', (data) => {
        //TODO: handle exchange
      });

      socket.on('stopFindingBuddy', (data) => {
        console.log('[SOCKET] User ' + user.username + ' stopped searching');
        usersSearchingIds = usersSearchingIds.remove(user.username);
        usersSearchingSet = usersSearchingSet.remove(socket);
      });

      socket.on('newMessage', (data) => {
        console.log('[SOCKET] User ' + user.username + ' sends message to User ' + data.username);
        let receiver = connectionMap.get(user.username);
        receiver.emit("newMessage", data.message);
      });

      socket.on('disconnect', () => {
        console.log('[SOCKET] ' + user.username + ' disconnected from ws');
        usersSearchingIds.remove(user.username);
        usersSearchingSet.remove(socket);
        if (connectionMap.has(user.username)) {
          abortTalk(socket, connectionMap.get(user.username));
        }
        socket.disconnect();
      });
    } catch (err) {
      console.log(err);
    }
  }

  io.on('connection', function (socket) {
    const session = socket.session;
    if (!session) return disconnectSocket(socket, 'no session in socket - internal bug');

    const userId = session.passport.user;
    if (!userId) return disconnectSocket(socket, "no authenticated user in socket's session");

    console.log("USER: '" + userId + "' connected to ws");
    handleUserSocket(socket);
  });
} else {
  console.error('==>     ERROR: No PORT environment variable has been specified');
}

