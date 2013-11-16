module.exports = function(BaseStorage) {

    var _ = require('underscore'),
        path = require('path'),
        fs = require('fs'),
        async = require('async');

    return BaseStorage.extend({

        /**
         * Upload all the variants to Local
         *
         * @param {Object} tempFile
         * @param {String} localFile
         * @param {String} filename
         * @param {String} type
         * @param {Function} cb
         * @return {Imager}
         * @api public
         */
        upload: function (tempFile, localFile, filename, type, cb) {
            var self = this,
                file = { filename: filename },
                directory = this.config['uploadDirectory'] || '',
                localPath = path.resolve(path.join( // find destination path
                    this.config['Local'].path, directory, localFile
                )),
                mode = this.config['Local'].mode || 0777;

            // make sure destination directory exists before writing
            async.reduce(path.dirname(localPath).split(path.sep), '',
                function (memo, item, next) {
                    if (item === '') item = path.sep; // for linux
                    var dir = memo ? path.join(memo, item) : item;

                    fs.exists(dir, function (exists) {
                        if (exists) return next(null, dir);
                        else fs.mkdir(dir, mode, function (err) {
                            if (err && fs.existsSync(dir)) {
                                return next(null, dir);
                            } else {
                                return next(err, err ? null : dir);
                            }
                        });
                    });
                }, function (err, memo) {
                    if (err) return cb(err);
                    var cbCalled = false;

                    var rs = fs.createReadStream(tempFile);
                    rs.on('error', function (err) {
                        if (!cbCalled) cb(err);
                        cbCalled = true;
                    });

                    var ws = fs.createWriteStream(localPath, {mode: mode});
                    ws.on('error', function (err) {
                        if (!cbCalled) cb(err);
                        cbCalled = true;
                    });
                    ws.on('finish', function () {
                        self.log(localFile + ' written');
                        if (!cbCalled) cb(null, file);
                        cbCalled = true;
                    });

                    return rs.pipe(ws);
                }
            );
        },

        /**
         * Remove all the variants from Local
         *
         * @param {Object} file
         * @param {Object} preset
         * @param {Function} cb
         * @return {Imager}
         * @api public
         */
        remove: function (file, preset, cb) {
            var localFile = preset.name + preset.sep + file;

            var directory = this.config['uploadDirectory'] || '';

            var localPath = path.resolve(path.join( // find destination path
                this.config['Local'].path, directory, localFile
            ));

            fs.unlink(localPath, function (err) {
                if (!err) {
                    self.log(localFile + ' removed');
                    return cb();
                } else {
                    return cb(err);
                }
            });
        }
    });
};
