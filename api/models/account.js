import mongoose, {Schema} from 'mongoose';
import passportLocalMongoose from 'passport-local-mongoose';
// TODO: Remodel Account database
const Account = new Schema({
  username: {type: String, default: 'John Doe'},
  password: {type: String},
  displayName: {type: String},
  locale: String,
  avatar: String,
  social: {
    vk: {
      id: String,
      membership: {type: Schema.Types.ObjectId, ref: 'Membership'}
    },
    facebook: {
      id: String,
      membership: {type: Schema.Types.ObjectId, ref: 'Membership'}
    },
    instagram: {
      id: String,
      membership: {type: Schema.Types.ObjectId, ref: 'Membership'}
    },
    twitter: {
      id: String,
      membership: {type: Schema.Types.ObjectId, ref: 'Membership'}
    },
  },

  friends: [{type: Schema.Types.ObjectId, ref: 'Account'}]
});

Account.statics.addFriend = async function (username, friendName) {
  try {
    const user = await this.findOne({username: username});
    const friend = await this.findOne({username: friendName});

    console.log("[CHAT] MAKING FRIENDS BETWEEN " + username + " AND " + friendName);

    user.friends.push(friend._id);
    await user.save();
    friend.friends.push(user._id);
    await friend.save();

    console.log(friend);

  } catch (err) {
    console.log(err);
  }
};

Account.plugin(passportLocalMongoose);

export default mongoose.model('Account', Account);
