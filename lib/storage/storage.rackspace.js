module.exports = function(BaseStorage) {

    var _ = require('underscore'),
        async = require('async'),
        fs = require('fs'),
        pkgcloud = require('pkgcloud');

    return BaseStorage.extend({

        type: 'Rackspace',

        /**
         * Upload all the variants to Rackspace
         *
         * @param {Object} tempFile
         * @param {String} remoteFile
         * @param {String} filename
         * @param {String} type
         * @param {Function} cb
         * @return {Imager}
         * @api public
         */

        upload: function (tempFile, remoteFile, filename, type, cb) {
            var self = this;
            var file = { filename: filename };
            var directory = this.config['uploadDirectory'] || '';

            this.getClient(function (err, client, container) {
                if (err) return cb(err);

                var rs = fs.createReadStream(tempFile);
                rs.on('error', cb);

                var options = {
                    stream: rs,
                    remote: directory + remoteFile,
                    container: container
                };

                client.upload(options, function (err, uploaded) {
                    if (err) return cb(err);
                    if (uploaded) {
                        self.log(remoteFile + ' uploaded');
                        cb(null, file);
                    } else {
                        cb(null, null);
                    }
                });
            });
        },


        /**
         * Remove all the variants from Rackspace
         *
         * @param {Object} file
         * @param {Object} preset
         * @param {Function} cb
         * @return {Imager}
         * @api public
         */

        remove: function (file, preset, cb) {
            var self = this;
            var remoteFile = preset.name + preset.sep + file;
            var directory = this.config['uploadDirectory'] || '';

            this.getClient(function (err, client, container) {
                client.removeFile(container, directory + remoteFile, function (err) {
                    if (!err) {
                        self.log(remoteFile + ' removed');
                        return cb();
                    } else if (err.statusCode === 404) {
                        self.log(remoteFile + ' not found');
                        return cb();
                    } else {
                        return cb(err);
                    }
                });
            });
        },

        /**
         * Get client for Rackspace API access
         *
         * @param {Function} cb
         * @return {Imager}
         * @api public
         */

        getClient: function (cb) {
            var clientConfig = this.config['Rackspace'],
                self = this;
            var client = this.client;
            if (!client) {
                // this maintains compatibility with v0.1.12 config files
                if (clientConfig.auth) {
                    for (var key in clientConfig.auth) {
                        if (clientConfig.hasOwnProperty(key)) continue;
                        clientConfig[key] = clientConfig.auth[key];
                    }
                    clientConfig.authUrl = clientConfig.host;
                    if (clientConfig.authUrl.indexOf('https') !== 0) {
                        clientConfig.authUrl = 'https://' + clientConfig.authUrl;
                    }
                }

                if (!clientConfig.provider) clientConfig.provider = 'rackspace';
                client = pkgcloud.storage.createClient(clientConfig);
                if (!client) return cb('Unable to create client for Rackspace');

                client.containerCache = {};
                this.client = client;
            }

            var container = client.containerCache[clientConfig.container];
            if (!container) {
                client.containerCache[clientConfig.container] = {connecting: true};
                client.getContainer(clientConfig.container, function gc(err, container) {
                    if (err && err.statusCode === 404) {
                        self.log('Creating container ' + clientConfig.container);
                        client.createContainer(clientConfig.container, gc);
                    } else if (err) {
                        cb(err);
                    } else {
                        if (container.cdnEnabled) {
                            _.extend(self, {
                                cdnUri: container.cdnUri,
                                cdnSslUri: container.cdnSslUri,
                                cdnStreamingUri: container.cdnStreamingUri,
                                cdniOSUri: container.cdniOSUri
                            });
                        }
                        client.containerCache[clientConfig.container] = container;
                        cb(null, client, container);
                    }
                });
            } else if (container.connecting) {
                setTimeout(this.getClient.bind(this, cb), 100);
            } else {
                process.nextTick(cb.bind(this, null, client, container));
            }
        }
    });
};
