import Account from '../models/account';
export default async function handleUserSocket(chatActor, socket) {
  function abortTalk(receiverSocket, msg = 'abortTalk', data = {}) {
    chatActor.terminateChat(socket, receiverSocket);
    receiverSocket.emit(msg, data);
  }
  try {
    const user = socket.user;
    socket.on('findBuddy', (data) => {
      if (!data || !data.locale) {
        socket.emit('chat.error', {error: 'NoLocale', message: 'No locale'});
        return;
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
      // TODO: Fix exchange ACCEPT
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

    socket.on('newMessage', (msg) => {
      const receiver = chatActor.getChatUser(socket);
      console.log('[SOCKET] User ' + user.username + ' sends message to User ' + receiver.user.username);
      receiver.emit('newMessage', msg);
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] ' + user.username + ' disconnected from ws');
      chatActor.removeSearchingUser(socket);
      const messageReceiver = chatActor.getChatUser(socket);
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
