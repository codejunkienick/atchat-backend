import bunyan from 'bunyan';
import bunyanRequest from 'bunyan-request';

export const logger = bunyan.createLogger({
  name: 'atchatAPI',
  streams: [
    {
      stream: process.stdout,
      level: 'debug'
    },
    {
      path: 'hello.log',
      level: 'trace'
    }
  ],
  serializers: {
    req: bunyan.stdSerializers.req,
    res: bunyan.stdSerializers.res,
  },
});

export const middleware = bunyanRequest({
  logger: logger,
  headerName: 'x-request-id'
});