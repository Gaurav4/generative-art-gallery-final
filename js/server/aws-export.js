// src/aws-exports.js

const awsconfig = {
    Auth: {
      region: 'us-west-2',
    },
    Storage: {
      AWSS3: {
        bucket: 'gaurav-reinvent',
        region: 'us-west-2',
      },
    },
  };
  
  export default awsconfig;
  
