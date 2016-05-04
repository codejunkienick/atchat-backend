import Account from 'models/account';
import ChatActor from 'modules/ChatActor';
const chatActor = new ChatActor({
  onStartChat: (socket1, socket2) => {
    const syncTime = Date.now();
    const dataForFirst = {
      receiver: {
        displayName: socket2.user.displayName,
        username: socket2.user.username,
      },
      time: syncTime
    };
    const dataForSecond = {
      receiver: {
        displayName: socket1.user.displayName,
        username: socket1.user.username,
      },
      time: syncTime
    };
    console.log("starting chat");
    socket1.emit('startChat', dataForFirst);
    socket2.emit('startChat', dataForSecond);
  },
  onEndChat: (socket1, socket2) => {
    console.log("endingchat");
    socket1.emit('endChat');
    socket2.emit('endChat');
  },
  onEndExchange: (socket1, socket2) => {
    console.log('end exchange');
    socket1.emit('endExchange');
    socket2.emit('endExchange');
  }
});
chatActor.run(); // Run CronJobs
export default async function handleUserSocket(socket) {
  function abortTalk(receiverSocket, msg = 'abortTalk', data = {}) {
    chatActor.terminateChat(socket, receiverSocket);
    receiverSocket.emit(msg, data);
  }
  try {
    const user = socket.user;
    socket.on('findBuddy', (data) => {
      if (!data || !data.locale) {
        socket.locale = (socket.user.locale) ? socket.user.locale : 'undefined'
      } else {
        socket.locale = data.locale;
      }
      if (chatActor.isUserSearching(socket)) {
        socket.emit('chat.error', {error: 'MultipleSearch', message: 'Multiple search is not allowed'});
        return;
      }
      console.log('[SOCKET] User ' + user.username + ' started searching');

      chatActor.addSearchingUser(socket);
    });

    socket.on('denyExchange', () => {
      const receiver = chatActor.getExchangeUser(socket);
      abortTalk(receiver.socket, 'exchangeFailure');
    });
    socket.on('exchange', async () => {
      const receiver = chatActor.getExchangeUser(socket);
      if (receiver) {
        const {status} = receiver;
        console.log(status + ' ' + receiver.socket.user.username);
        switch (status) {
          case 'PENDING':
            chatActor.acceptExchange(socket, receiver.socket);
            break;
          case 'ACCEPT':
            console.log('YAY');
            await Account.addFriend(socket.user.username, receiver.socket.user.username);
            socket.emit('exchangeSuccess');
            receiver.socket.emit('exchangeSuccess');
            break;
          default:
            break;
        }
      }
    });

    socket.on('stopFindingBuddy', () => {
      console.log('[SOCKET] User ' + user.username + ' stopped searching');
      chatActor.removeSearchingUser(socket);
    });

    socket.on('typingMessage', () => {
      const receiver = chatActor.getConnectedUser(socket);
      receiver.emit('typingMessage');
    });

    socket.on('newMessage', (msg) => {
      const receiver = chatActor.getConnectedUser(socket);
      console.log('[SOCKET] User ' + user.username + ' sends message to User ' + receiver.user.username);
      receiver.emit('newMessage', msg);
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] ' + user.username + ' disconnected from ws');
      chatActor.removeSearchingUser(socket);
      const messageReceiver = chatActor.getConnectedUser(socket);
      const exchangeReceiver = chatActor.getExchangeUser(socket);
      if (messageReceiver) {
        abortTalk(messageReceiver);
      }
      if (exchangeReceiver) {
        abortTalk(exchangeReceiver.socket);
      }
      socket.disconnect();
    });
  } catch (err) {
    console.log(err);
  }
}
