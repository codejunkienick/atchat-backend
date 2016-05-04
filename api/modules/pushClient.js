import gcm from 'node-gcm';
import config from 'config';

const sender = new gcm.Sender(config.googleAPIKey);

const message = new gcm.Message();
message.addNotification({
  title: 'Kek from server!!!',
  body: 'Abnormal data access',
  icon: 'ic_launcher'
});
// Add the registration tokens of the devices you want to send to

export function test() {
  sender.send(message, { topic: '/topics/global' }, function(err, response) {
    if(err) console.error(err);
    else    console.log(response);
  });
}
