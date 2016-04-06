import mongoose, {Schema} from 'mongoose';
import passportLocalMongoose from 'passport-local-mongoose';

const Account = new Schema({
  username: String,
  password: String,
  displayName: String,
  social: {
    vk: String,
    facebook: String,
    instagram: String,
    twitter: String
  },
  facebook: {},

  friends: [{type: Schema.Types.ObjectId, ref: "Account"}]
});

Account.statics.addFriend = async function (username, friendName) {
  try {
    const user = await this.findOne({username: username});
    const friend = await this.findOne({username: friendName});

    console.log("[CHAT] MAKING FRIENDS BETWEEN " + username + " AND " + friendName);

    console.log(friend);

    user.friends.push(friend._id);
    friend.friends.push(user._id);

    user.save();
    friend.save();

  } catch (err) {
    console.log(err);
  }
};

Account.plugin(passportLocalMongoose);

export default mongoose.model('Account', Account);