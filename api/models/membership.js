import mongoose, {Schema} from 'mongoose';

const Membership = new Schema({
  provider:  String,
  providerUserId:  String,
  accessToken: String,
  user: {type: Schema.ObjectId, ref: 'Account'},
  dateAdded: {type: Date, default: Date.now}
});

export default mongoose.model('Membership', Membership);
