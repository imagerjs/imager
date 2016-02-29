
// Checkout https://github.com/e-conomic/graphicsmagick-stream
// for preset options

exports.variants = {
  item: {           // variant
    thumb: {        // preset
      options: {    // preset options
        pool: 5,
        scale: { width: 200, height: 150, type: 'contain' },
        crop: { width: 200, height: 150, x: 0, y: 0 },
        format: 'png',
        rotate: 'auto',
      },
      rename: function (file, preset) {
        return;
        // return 'users/1/' + preset + '/' + file.name;
      }
    },
    large: {
      original: true  // upload original image without image processing
    }
  }
};

exports.storages = {
  local: {
    provider: 'local',
    path: '/tmp',
    mode: 0777
  },
  rackspace: {
    provider: 'rackspace',
    username: process.env.IMAGER_RACKSPACE_USERNAME,
    apiKey: process.env.IMAGER_RACKSPACE_KEY,
    authUrl: 'https://lon.auth.api.rackspacecloud.com',
    region: 'IAD', // https://github.com/pkgcloud/pkgcloud/issues/276
    container: process.env.IMAGER_RACKSPACE_CONTAINER
  },
  amazon: {
    provider: 'amazon',
    key: process.env.IMAGER_S3_KEY,
    keyId: process.env.IMAGER_S3_KEYID,
    container: process.env.IMAGER_S3_BUCKET
  }
}
