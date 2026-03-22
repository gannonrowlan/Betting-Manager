process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '4010';

require('../src/server');
