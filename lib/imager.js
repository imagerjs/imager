/*!
 * node-imager
 * Copyright(c) 2012 Madhusudhan Srinivasa <madhums8@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var gm = require('gm').subClass({ imageMagick: true })
  , fs = require('fs')
  , path = require('path')
  , mime = require('mime')
  , pkgcloud = require('pkgcloud')
  , knox = require('knox')
  , async = require('async')
  , os = require('os')
  , _ = require('lodash');

var debug, config, storage, uploadedFiles = [];
var tempDir = path.normalize(os.tmpDir() + path.sep);
var contentType = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif'
};

/**
 * Initialize Imager with config
 *
 * @param {Object} config
 * @param {Array} storage
 * @return {Imager}
 * @api public
 */

var Imager = module.exports = function Imager (config, storage) {
  if (!config || typeof config !== 'object') {
    throw new Error('Please provide the config');
  }

  if (!config.storage) {
    throw new Error('Please specify a storage');
  }

  if (typeof storage === 'undefined') {
    throw new Error('Please specify the storage');
  }

  if (typeof storage === 'string') {
    storage = [storage];
  }

  storage.forEach(function(s) {
    if (!config.storage[s]) {
      throw new Error('The storage you have specified does not exist');
    }
  })

  for (i in config.variants) {
    if(['undefined', 'function'].indexOf(typeof config.variants[i].rename) === -1) {
      throw new Error('Please specify a valid rename function for variant: ' + i);
    }
  }


  debug = config.debug;

  this.config = config;
  this.storage = storage;
  this.uploadedFiles = [];
  this.clientCache = {};
};


Imager.prototype = {

  /**
   * Uploads variants to the provided storage
   *
   * @param {Array} files
   * @param {Function} callback
   * @param {String} variant
   * @return {Imager}
   * @api public
   */

  upload: function (files, callback, variant) {
    var self = this;

    if (!variant) {
      variant = callback
      callback = function () {};
    }

    if (typeof variant !== 'string' && !this.config.variants.default) {
      throw new Error('Please specify a proper variant OR provide a default');
    }

    if (!variant && this.config.variants.default) {
      variant = 'default';
    }

    if (typeof variant === 'string' && !this.config.variants[variant]) {
      throw new Error('Please provide a variant which you have specified in the config file');
    }

    if (!files) {
      throw new Error('Please provide the files to upload.');
    } else if (typeof files === 'string') {
      files = [files];
    }

    variant = this.config.variants[variant];

    async.map(files, getFileInfo, function (err, files) {
      if (err) return callback(err);

      var prepare = function (file, fn) {
        var ct = getFileType(file);

        function defaultRename(filename) {
          return variant.keepNames ? path.basename(file.name) :
            Math.round(new Date().getTime()) + contentType[ct];
        }

        var filename = (variant.rename || defaultRename)(file.name);

        self.prepareUpload(file, filename, variant, fn);
      };

      async.forEach(files, prepare, function (err) {
        if (err) return callback(err);
        callback(null, self.cdnUri, self.uploadedFiles);
      });
    });

    return this;
  },

  /**
   * Remove all variants from the provided storage
   *
   * @param {String|Array} files
   * @param {Function} callback
   * @param {String} variant
   * @return {Imager}
   * @api public
   */

  remove: function (files, callback, variant) {
    if (!variant) {
      variant = callback
      callback = function () {};
    }

    if (typeof variant !== 'string' && !this.config.variants.default) {
      throw new Error('Please specify a proper variant to remove the files');
    }

    if (!variant && this.config.variants.default) {
      variant = 'default';
    }

    if (typeof variant === 'string' && !this.config.variants[variant]) {
      throw new Error('Please provide a variant which you have specified in the config file');
    }

    var self = this;

    if (!Array.isArray(files) && typeof files === 'string') {
      files = files.split();
    }

    var prepareRemove = function (file, fn) {
      self.prepareRemove(file, fn, self.config.variants[variant]);
    };

    async.forEach(files, prepareRemove, function (err) {
      if (err) return callback(err);
      callback(null);
    });

    return this;
  },

  /**
   * Prepare upload
   *
   * @param {Object} file
   * @param {String} filename
   * @param {String} variant
   * @param {Function} fn
   * @return {Imager}
   * @api public
   */

  prepareUpload: function (file, filename, variant, fn) {
    if (!file.size) return fn();

    var asyncArr = [];
    var self = this;

    if (variant.resize) {
      Object.keys(variant.resize).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            size: variant.resize[name],
            sep: variant.separator || '_'
          };
          self.resizeFile(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    if (variant.crop) {
      Object.keys(variant.crop).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            size: variant.crop[name],
            sep: variant.separator || '_'
          };
          self.cropFile(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    if (variant.resizeAndCrop) {
      Object.keys(variant.resizeAndCrop).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            type: variant.resizeAndCrop[name],
            sep: variant.separator || '_'
          };
          self.resizeAndCropFile(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    if (variant.thumbnail) {
      Object.keys(variant.thumbnail).forEach(function (name) {
        var processFiles = function (cb) {
          var preset = {
            name: name,
            size: variant.thumbnail[name],
            sep: variant.separator || '_'
          };
          self.thumbnail(file, preset, filename, cb);
        };
        asyncArr.push(processFiles);
      });
    }

    async.parallel(asyncArr, function (err, results) {
      var f = _.uniq(results).toString();

      f = f.indexOf(',') === -1
        ? f
        : f.slice(0, f.length - 1);

      self.uploadedFiles.push(f);
      fn(err);
    });
  },

  /**
   * Create a thumbnail scaled and cut to fit
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} filename
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  thumbnail: function(file, preset, filename, cb) {
    var self = this;
    var ct = file['type'] || file.headers['content-type'];
    var remoteFile = preset.name + preset.sep + filename;
    var tempFile = path.join(tempDir, 'imager_' +
      Math.round(new Date().getTime()) + '_' +
      Math.floor(Math.random() * 1000) + contentType[ct]);

    var gravity = 'Center'
    if (preset.size.indexOf(' ') > -1) {
      gravity = preset.size.split(' ')[1];
      preset.size = preset.size.split(' ')[0];
    }

    var w = preset.size.split('x')[0]
    var h = preset.size.split('x')[1]

    var cmd = gm(file['path'])
      .autoOrient()
      .command('convert')
      .out('-thumbnail', w+'x'+h+'^')
      .gravity(gravity)
      .extent(w,h)
      .write(tempFile, function (err) {
        if (err) return cb(err);
        async.each(self.storage, function (storage, cb) {
          self['pushTo' + storage](tempFile, remoteFile, filename, ct, cb);
        }, function (err) {
          fs.unlink(tempFile, function (err) {
            if (err) console.error(err);
          });
          if (err) cb(err);
          else cb(null, filename);
        });
      });
  },

  /**
   * Resize file
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} filename
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  resizeFile: function (file, preset, filename, cb) {
    var self = this;
    var ct = getFileType(file);
    var remoteFile = preset.name + preset.sep + filename;
    var tempFile = path.join(tempDir, 'imager_' +
      Math.round(new Date().getTime()) + '_' +
      Math.floor(Math.random() * 1000) + contentType[ct]);

    gm(file['path'])
      .autoOrient()
      .resize(preset.size.split('x')[0], preset.size.split('x')[1])
      .write(tempFile, function (err) {
        if (err) return cb(err);
        async.each(self.storage, function (storage, cb) {
          self['pushTo' + storage](tempFile, remoteFile, filename, ct, cb);
        }, function (err) {
          fs.unlink(tempFile, function (err) {
            if (err) console.error(err);
          });
          if (err) cb(err);
          else cb(null, filename);
        });
      });
  },

  /**
   * Crop file
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} filename
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  cropFile: function (file, preset, filename, cb) {
    var self = this;
    var ct = getFileType(file);
    var remoteFile = preset.name + preset.sep + filename;
    var tempFile = path.join(tempDir, 'imager_' +
      Math.round(new Date().getTime()) + '_' +
      Math.floor(Math.random() * 1000) + contentType[ct]);

    var gravity = 'NorthWest'
    if (preset.size.indexOf(' ') > -1) {
      gravity = preset.size.split(' ')[1];
      preset.size = preset.size.split(' ')[0];
    }

    gm(file['path'])
      .autoOrient()
      .gravity(gravity)
      .crop(preset.size.split('x')[0], preset.size.split('x')[1])
      .write(tempFile, function (err) {
        if (err) return cb(err);
        async.each(self.storage, function (storage, cb) {
          self['pushTo' + storage](tempFile, remoteFile, filename, ct, cb);
        }, function (err) {
          fs.unlink(tempFile, function (err) {
            if (err) console.error(err);
          });
          if (err) cb(err);
          else cb(null, filename);
        });
      });
  },

  /**
   * Resize and crop file
   *
   * @param {Object} file
   * @param {Object} preset
   * @param {String} filename
   * @param {Function} cb
   * @return {Imager}
   * @api public
   */

  resizeAndCropFile: function (file, preset, filename, cb) {
    var self = this;
    var ct = getFileType(file);
    var remoteFile = preset.name + preset.sep + filename;
    var tempFile = path.join(tempDir, 'imager_' +
      Math.round(new Date().getTime()) + '_' +
      Math.floor(Math.random() * 1000) + contentType[ct]);

    var gravity = 'NorthWest'
    if (preset.type.crop.indexOf(' ') > -1) {
      gravity = preset.type.crop.split(' ')[1];
      preset.type.crop = preset.type.crop.split(' ')[0];
    }

    gm(file['path'])
      .autoOrient()
      .resize(preset.type.resize.split('x')[0], preset.type.resize.split('x')[1])
      .gravity(gravity)
      .crop(preset.type.crop.split('x')[0], preset.type.crop.split('x')[1])
      .write(tempFile, function (err) {
        if (err) return cb(err);
        async.each(self.storage, function (storage, cb) {
          self['pushTo' + storage](tempFile, remoteFile, filename, ct, cb);
        }, function (err) {
          fs.unlink(tempFile, function (err) {
            if (err) console.error(err);
          });
          if (err) cb(err);
          else cb(null, filename);
        });
      });
  },

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

  pushToLocal: function (tempFile, localFile, filename, type, cb) {
    var directory = this.config['storage']['uploadDirectory'] || '';
    var localPath = path.resolve(path.join( // find destination path
      this.config['storage']['Local'].path, directory, localFile
    ));
    var mode = this.config['storage']['Local'].mode || 0777;

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
          log(localFile + ' written');
          if (!cbCalled) cb(null, filename);
          cbCalled = true;
        });

        return rs.pipe(ws);
      }
    );
  },

  /**
  * Get client for Rackspace API access
  *
  * @param {Function} cb
  * @return {Imager}
  * @api public
  */

  getClientForRackspace: function (cb) {
    var clientConfig = this.config['storage']['Rackspace'];

    var client = this.clientCache['Rackspace'];
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
      this.clientCache['Rackspace'] = client;
    }

    var container = client.containerCache[clientConfig.container];
    if (!container) {
      client.containerCache[clientConfig.container] = {connecting: true};
      client.getContainer(clientConfig.container, function gc(err, container) {
        if (err && err.statusCode === 404) {
          log('Creating container ' + clientConfig.container);
          client.createContainer(clientConfig.container, gc);
        } else if (err) {
          cb(err);
        } else {
          client.containerCache[clientConfig.container] = container;
          cb(null, client, container);
        }
      });
    } else if (container.connecting) {
      setTimeout(this.getClientForRackspace.bind(this, cb), 100);
    } else {
      process.nextTick(cb.bind(this, null, client, container));
    }
  },

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

  pushToRackspace: function (tempFile, remoteFile, filename, type, cb) {
    var self = this;
    var directory = this.config['storage']['uploadDirectory'] || '';

    this.getClientForRackspace(function (err, client, container) {
      if (err) return cb(err);

      var rs = fs.createReadStream(tempFile);
      rs.on('error', cb);

      var options = {
        stream: rs,
        remote: directory + remoteFile,
        container: container
      };
      self.cdnUri = container.cdnUri;
      client.upload(options, function (err, uploaded) {
        if (err) return cb(err);
        if (uploaded) {
          log(remoteFile + ' uploaded');
          cb(null, filename);
        } else {
          cb(null, null);
        }
      });
    });
  },

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

  pushToS3: function (tempFile, remoteFile, filename, type, cb) {
    var self = this;
    var s3Config = this.config['storage']['S3'];
    var client = knox.createClient(s3Config);
    var directory = this.config['storage']['uploadDirectory'] || '';
    var options = { 'x-amz-acl': 'public-read' };

    if(s3Config.storageClass) {
      options['x-amz-storage-class'] = s3Config.storageClass;
    }

    client.putFile(tempFile, directory + remoteFile, options, function (err, res) {
      var cdn;
      if (err) return cb(err);
      log(remoteFile + ' uploaded');

      // support cloudfront cdn
      cdn = s3Config['cdn'];
      if (cdn) {
        self.cdnUri = (~cdn.indexOf('http://') || ~cdn.indexOf('https://'))
          ? cdn
          : 'http://' + cdn;
      } else {
        self.cdnUri = 'http://' + client.endpoint + "/" + client.bucket;
      }
      res.resume();
      cb(err, filename);
    });
  },

  /**
   * Prepare removing of all the variants
   *
   * @param {Object} file
   * @param {Function} fn
   * @param {String} variant
   * @return {Imager}
   * @api public
   */

  prepareRemove: function (file, fn, variant) {
    var asyncArr = [];
    var self = this;

    if (variant.resize) {
      Object.keys(variant.resize).forEach(function (name) {
        var removeFiles = function (cb) {
          var preset = {
            name: name,
            size: variant.resize[name],
            sep: variant.separator || '_'
          };
          async.each(self.storage, function (storage, cb) {
            self['removeFrom' + storage](file, preset, cb);
          }, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    if (variant.crop) {
      Object.keys(variant.crop).forEach(function (name) {
        var removeFiles = function (cb) {
          var preset = {
            name: name,
            size: variant.crop[name],
            sep: variant.separator || '_'
          };
          async.each(self.storage, function (storage, cb) {
            self['removeFrom' + storage](file, preset, cb);
          }, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    if (variant.resizeAndCrop) {
      Object.keys(variant.resizeAndCrop).forEach(function (name) {
        var removeFiles = function (cb) {
          var preset = {
            name: name,
            type: variant.resizeAndCrop[name],
            sep: variant.separator || '_'
          };
          async.each(self.storage, function (storage, cb) {
            self['removeFrom' + storage](file, preset, cb);
          }, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    if (variant.thumbnail) {
      Object.keys(variant.thumbnail).forEach(function (name) {
        var removeFiles = function (cb) {
          var preset = {
            name: name,
            size: variant.thumbnail[name],
            sep: variant.separator || '_'
          };
          async.each(self.storage, function (storage, cb) {
            self['removeFrom' + storage](file, preset, cb);
          }, cb);
        };
        asyncArr.push(removeFiles);
      });
    }

    async.parallel(asyncArr, function (err, results) {
      fn(err);
    });
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

  removeFromLocal: function (file, preset, cb) {
    var localFile = preset.name + preset.sep + file;

    var directory = this.config['storage']['uploadDirectory'] || '';

    var localPath = path.resolve(path.join( // find destination path
      this.config['storage']['Local'].path, directory, localFile
    ));

    fs.unlink(localPath, function (err) {
      if (!err) {
        log(localFile + ' removed');
        return cb();
      } else {
        return cb(err);
      }
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

  removeFromRackspace: function (file, preset, cb) {
    var self = this;
    var remoteFile = preset.name + preset.sep + file;
    var directory = this.config['storage']['uploadDirectory'] || '';

    this.getClientForRackspace(function (err, client, container) {
      client.removeFile(container, directory + remoteFile, function (err) {
        if (!err) {
          log(remoteFile + ' removed');
          return cb();
        } else if (err.statusCode === 404) {
          log(remoteFile + ' not found');
          return cb();
        } else {
          return cb(err);
        }
      });
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

  removeFromS3: function (file, preset, cb) {
    var self = this;
    var client = knox.createClient(this.config['storage']['S3']);
    var remoteFile = preset.name + preset.sep + file;
    var directory = this.config['storage']['uploadDirectory'] || '';

    client.deleteFile(directory + remoteFile, function (err, res) {
      log(remoteFile + ' removed');
      if (err) console.error(err);
      cb(err);
      res.resume();
    });
  }
};

/**
 * Log
 *
 * @param {String} str
 * @api private
 */

function log (str) {
  if (debug) {
    console.info(str);
  }
}

/**
 * Get file info
 *
 * @param {String} file
 * @param {Function} cb
 * @api private
 */

function getFileInfo (file, cb) {

  var f = {
    size: typeof(file) == 'string' ? fs.statSync(file).size : file.size,
    type: typeof(file) == 'string' ? mime.lookup(file) : file.type,
    name: typeof(file) == 'string' ? file.split('/')[file.split('/').length - 1] : file.name,
    path: typeof(file) == 'string' ? file : file.path
  };
  file = f;
  cb(null, file);
};

function getFileType(file) {
  return (file['type'] || file['mimetype']) || file.headers['content-type'];
}
