module.exports = function(BaseStorage) {

    var _ = require('underscore'),
        async = require('async'),
        knox = require('knox');

    return BaseStorage.extend({

        type: 'S3',

        /**
         * Upload all the variants to Amazon S3
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
            var s3Config = this.config['S3'];
            var client = knox.createClient(s3Config);
            var directory = this.config['uploadDirectory'] || '';

            var options = { 'x-amz-acl': 'public-read' };
            if (s3Config.storageClass) {
                options['x-amz-storage-class'] = s3Config.storageClass;
            }

            client.putFile(tempFile, directory + remoteFile, options, function (err, res) {
                if (err) return cb(err);
                self.log(remoteFile + ' uploaded');
                self.cdnUri = 'http://' + client.endpoint;
                cb(err, file);
            });
        },


        /**
         * Remove all the variants from Amazon S3
         *
         * @param {Object} file
         * @param {Object} preset
         * @param {Function} cb
         * @return {Imager}
         * @api public
         */

        remove: function (file, preset, cb) {
            var self = this;
            var client = knox.createClient(this.config['S3']);
            var remoteFile = preset.name + preset.sep + file;
            var directory = this.config['uploadDirectory'] || '';

            client.deleteFile(directory + remoteFile, function (err, res) {
                self.log(remoteFile + ' removed');
                if (err) console.error(err);
                cb(err);
            });
        }
    });
};
