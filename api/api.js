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

  let usersSearchingSet = Immutable.Set();
  let currentChats = Immutable.Stack();
  let connectionMap = new Map();
  let connectionInProgress = false;
  let disconnectInProgress = false;

  const connectUsers = new CronJob('* * * * * *', async function() {
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
        displayName: userSecond.displayName,
        username: userSecond.username,
        time: syncTime
      };
      const dataForSecond = {
        displayName: userFirst.displayName,
        username: userFirst.username,
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
      socketFirst.emit('foundBuddy', dataForFirst);
      socketSecond.emit('foundBuddy', dataForSecond);
    }
    usersSearchingSet = Immutable.Set(usersSearching);
    connectionInProgress = false;
  }, null, false);

  const disconnectUsers = new CronJob('* * * * * *', function() {
    if (!currentChats.first() || currentChats.first() == undefined || disconnectInProgress) return;
    disconnectInProgress = true;
    while (true) {
      let lastTalk = currentChats.first();
      if (!lastTalk || lastTalk.endTime - new Date().getTime() > 0) {
        break;
      }
      console.log(lastTalk.endTime - new Date().getTime());
      console.log('[CRON] removing last talk ');
      console.log('between ' + lastTalk.user1.session.passport.user + " and " + lastTalk.user2.session.passport.user);
      lastTalk.user1.emit('stopTalk');
      lastTalk.user2.emit('stopTalk');
      connectionMap.delete(lastTalk.user1.session.passport.user);
      connectionMap.delete(lastTalk.user2.session.passport.user);
      currentChats = currentChats.pop();
    }
    disconnectInProgress = false;
  }, null, false);

  connectUsers.start();
  disconnectUsers.start();

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
        if (usersSearchingSet.has(socket)) {
          console.log('[SOCKET] User ' + user.username + ' multiple search ' );
        }
        usersSearchingSet = usersSearchingSet.add(socket);
      });
      socket.on('stopFindingBuddy', (data) => {
        console.log('[SOCKET] User ' + user.username + ' stopped searching');
        usersSearchingSet = usersSearchingSet.remove(socket);
      });
      socket.on('newMessage', (data) => {
        console.log('[SOCKET] User ' + user.username + ' sends message to User ' + data.username);
        let receiver = connectionMap.get(user.username);
        receiver.emit("newMessage", data.message);
      });
      socket.on('1', () => {
        console.log('[SOCKET] ' + user.username + ' disconnected from ws');
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

