import mongoose, {Schema} from 'mongoose';

const Exchange = new Schema({
  user1: {type: Schema.ObjectId, ref: 'Account'},
  user2: {type: Schema.ObjectId, ref: 'Account'},
  result: {
    type: String,
    enum: ['SUCCESS', 'FAILURE']
  },
  chatHistory: [{
    user: {type: Schema.ObjectId, ref: 'Account'},
    message: {type: String, required: true},
    date: {type: Date}
  }],
  date: {type: Date, default: Date.now}
});

Exchange.index({user1: 1, user2: 1});

Exchange.methods.getUserExchanges = async function (userId, dateFrom = null) {
  const query = {
    $or: [{user1: userId}, {user2: userId}]
  };
  return await Exchange.find((dateFrom) ? {...query, date: {$lte: dateFrom}} : query).limit(10);
};

export default mongoose.model('Exchange', Exchange);
